import { q, tx, uid, nowIso, json } from "../db";
import { audit } from "../audit";
import { AppError, badRequest, conflict, notFound } from "../errors";
import { POLICY_VERSION } from "../env";
import { getSettings } from "../settings";
import type { SessionUser } from "../auth";
import { defaultProviderId, ensureProviders, isExternal, runAI } from "../ai/router";
import { ProviderError, type ProviderId } from "../ai/types";
import { retrieve } from "../resume/retrieve";
import { COMPETENCIES, compByKey, ensureCatalog, templateFor, type Difficulty, type InterviewType } from "./catalog";
import { assertTransition, isTerminal, type Status } from "./state";
import { ALL_EVENT_TYPES, describeEvent, INTERPRETATION, isCameraType, policyAllows, type EventType, type MonitoringPolicy } from "./events";
import { buildReport } from "./report";

export type SessionRow = {
  id: string; candidate_id: string; organization_id: string | null; resume_id: string | null; role_id: string | null; role_title: string;
  job_description: string; interview_type: InterviewType; difficulty: Difficulty; duration_min: number; max_questions: number;
  focus_json: string; answer_mode: "voice" | "text"; status: Status; provider_id: ProviderId | null; demo_mode: number;
  monitoring_policy_json: string; share_with_org: number; failure_reason: string | null; started_at: string | null; paused_at: string | null;
  completed_at: string | null; total_paused_ms: number; report_json: string | null; created_at: string; updated_at: string;
};
type QuestionRow = { id: string; session_id: string; ordinal: number; parent_question_id: string | null; kind: "primary" | "follow_up" | "clarification"; text: string; competency_key: string; rationale: string | null; evidence_chunk_ids_json: string; needs_clarification: number; provider_id: string | null; created_at: string };

export const CONSENT_TYPES = ["ai_processing", "microphone", "camera", "video_diagnostics", "integrity_monitoring", "share_with_org"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export function getOwnedSession(userId: string, id: string): SessionRow {
  const s = q.get<SessionRow>("SELECT * FROM interview_sessions WHERE id = ? AND candidate_id = ?", id, userId);
  if (!s) throw notFound("Interview not found.");
  return s;
}

const setStatus = (id: string, status: Status, extra: Record<string, unknown> = {}) => {
  const cols = Object.keys(extra);
  q.run(`UPDATE interview_sessions SET status = ?, updated_at = ?${cols.map((c) => `, ${c} = ?`).join("")} WHERE id = ?`, status, nowIso(), ...cols.map((c) => extra[c]), id);
};

// ---------- creation ----------

export type CreateInput = {
  roleId?: string | null; roleTitle?: string; jobDescription?: string; interviewType: InterviewType; difficulty: Difficulty;
  durationMin: number; focus: string[]; resumeId?: string | null; answerMode: "voice" | "text"; shareOrgId?: string | null;
  monitoring?: Partial<MonitoringPolicy>;
};

export function createInterview(user: SessionUser, input: CreateInput) {
  ensureCatalog();
  ensureProviders();
  let roleTitle = input.roleTitle?.trim() ?? "";
  let jd = input.jobDescription?.trim() ?? "";
  if (input.roleId) {
    const role = q.get<{ title: string; description: string }>("SELECT title, description FROM job_roles WHERE id = ? AND (is_sample = 1 OR owner_id = ?)", input.roleId, user.id);
    if (!role) throw notFound("Role not found.");
    roleTitle = roleTitle || role.title;
    jd = jd || role.description;
  }
  if (!roleTitle) throw badRequest("Add a target role.", "role_required");
  if (jd.length < 20) throw badRequest("Add a short job description (at least 20 characters) so questions can be tailored.", "jd_required");

  let resumeId: string | null = null;
  if (input.resumeId) {
    const r = q.get<{ id: string; status: string }>("SELECT id, status FROM resume_documents WHERE id = ? AND owner_id = ?", input.resumeId, user.id);
    if (!r) throw notFound("Resume not found.");
    if (r.status !== "READY") throw conflict("That resume is still processing or failed. Wait for it to finish or choose another.", "resume_not_ready");
    resumeId = r.id;
  }
  let orgId: string | null = null;
  if (input.shareOrgId) {
    if (!q.get("SELECT 1 FROM organizations WHERE id = ?", input.shareOrgId)) throw notFound("Organization not found.");
    orgId = input.shareOrgId;
  }

  const tpl = templateFor(input.interviewType);
  const maxQuestions = Math.max(2, Math.min(8, Math.round(input.durationMin / 4)));
  const defaults = getSettings().monitoringDefaults;
  const policy: MonitoringPolicy = { enabled: true, ...defaults, ...(input.monitoring ?? {}) } as MonitoringPolicy;
  const providerId = defaultProviderId();
  const id = uid();
  void tpl;
  q.run(
    `INSERT INTO interview_sessions (id, candidate_id, organization_id, resume_id, role_id, role_title, job_description, interview_type, difficulty, duration_min, max_questions, focus_json, answer_mode, status, provider_id, demo_mode, monitoring_policy_json, share_with_org)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'CREATED', ?,?,?,0)`,
    id, user.id, orgId, resumeId, input.roleId ?? null, roleTitle, jd, input.interviewType, input.difficulty, input.durationMin, maxQuestions,
    JSON.stringify(input.focus.slice(0, 6)), input.answerMode, providerId, providerId === "mock" ? 1 : 0, JSON.stringify(policy),
  );
  audit({ id: user.id, role: user.role }, "interview.create", { type: "interview", id });
  return id;
}

// ---------- consent ----------

export function recordConsent(user: SessionUser, sessionId: string, items: { type: ConsentType; granted: boolean }[]) {
  const s = getOwnedSession(user.id, sessionId);
  if (isTerminal(s.status)) throw conflict("This interview has ended.");
  tx(() => {
    for (const it of items) {
      q.run("INSERT INTO consent_records (id, user_id, session_id, type, granted, policy_version, details_json) VALUES (?,?,?,?,?,?,?)", uid(), user.id, sessionId, it.type, it.granted ? 1 : 0, POLICY_VERSION, JSON.stringify({ provider: s.provider_id }));
      if (it.type === "share_with_org") q.run("UPDATE interview_sessions SET share_with_org = ?, updated_at = ? WHERE id = ?", it.granted && s.organization_id ? 1 : 0, nowIso(), sessionId);
    }
  });
  audit({ id: user.id, role: user.role }, "consent.record", { type: "interview", id: sessionId }, { types: items.map((i) => `${i.type}:${i.granted}`) });
  return getConsents(sessionId);
}

/** Latest decision per consent type. Anything never answered counts as not granted. */
export function getConsents(sessionId: string): Record<ConsentType, boolean> {
  const rows = q.all<{ type: ConsentType; granted: number }>("SELECT type, granted FROM consent_records WHERE session_id = ? ORDER BY created_at, rowid", sessionId);
  const out = Object.fromEntries(CONSENT_TYPES.map((t) => [t, false])) as Record<ConsentType, boolean>;
  for (const r of rows) out[r.type] = !!r.granted;
  return out;
}

// ---------- question generation ----------

function usedChunkIds(sessionId: string): Set<string> {
  const ids = new Set<string>();
  for (const r of q.all<{ evidence_chunk_ids_json: string }>("SELECT evidence_chunk_ids_json FROM interview_questions WHERE session_id = ?", sessionId)) for (const i of json<string[]>(r.evidence_chunk_ids_json, [])) ids.add(i);
  return ids;
}

async function generateQuestion(s: SessionRow, kind: "primary", ordinal: number, primaryIndex: number) {
  const tpl = templateFor(s.interview_type);
  const compKey = tpl.competencyKeys[primaryIndex % tpl.competencyKeys.length];
  const comp = compByKey(compKey);
  const focus = json<string[]>(s.focus_json, []);
  let evidence: { id: string; section: string; text: string }[] = [];
  if (s.resume_id) {
    const query = [s.role_title, ...focus, ...comp.keywords, s.job_description.slice(0, 400)].join(" ");
    const used = usedChunkIds(s.id);
    const hits = await retrieve(s.candidate_id, query, { documentId: s.resume_id, k: 8 });
    // Skip flagged chunks entirely and require a minimum relevance so weak matches become a clarification, not a fabrication.
    evidence = hits.filter((h) => !used.has(h.chunkId) && !h.injectionFlagged && h.score >= 0.06).slice(0, 3).map((h) => ({ id: h.chunkId, section: h.section, text: h.text }));
  }
  const previous = q.all<{ text: string; competency_key: string }>("SELECT text, competency_key FROM interview_questions WHERE session_id = ? ORDER BY ordinal", s.id).map((p) => ({ question: p.text, answer: "", competencyKey: p.competency_key }));
  const run = await runAI({ providerId: (s.provider_id ?? "mock") as ProviderId, operation: "generateInterviewQuestion", sessionId: s.id }, (p) =>
    p.generateInterviewQuestion({
      roleTitle: s.role_title, jobDescription: s.job_description, interviewType: s.interview_type, difficulty: s.difficulty, focus,
      competencyKey: compKey, ordinal: primaryIndex + 1, maxQuestions: s.max_questions, evidence, resumeAttached: !!s.resume_id, previous,
    }),
  );
  const g = run.value;
  const id = uid();
  q.run(
    "INSERT INTO interview_questions (id, session_id, ordinal, kind, text, competency_key, rationale, evidence_chunk_ids_json, needs_clarification, provider_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
    id, s.id, ordinal, kind, g.text, COMPETENCIES.some((c) => c.key === g.competencyKey) ? g.competencyKey : compKey, g.rationale, JSON.stringify(g.evidenceChunkIds), g.needsClarification ? 1 : 0, run.providerUsed,
  );
  q.run("INSERT INTO transcript_segments (id, session_id, question_id, speaker, text, original_text) VALUES (?,?,?,'ai',?,?)", uid(), s.id, id, g.text, g.text);
  return { id, run };
}

const aiFailure = (e: unknown) => {
  if (e instanceof ProviderError) return new AppError(502, `provider_${e.code}`, e.message, { recoverable: true, provider: e.providerId });
  return e;
};

// ---------- lifecycle ----------

export async function startInterview(user: SessionUser, id: string) {
  const s = getOwnedSession(user.id, id);
  if (s.status === "IN_PROGRESS" || s.status === "PAUSED") return getState(user, id); // idempotent re-entry
  if (!getConsents(id).ai_processing) throw new AppError(409, "consent_required", "Confirm how your answers are processed before starting.");
  assertTransition(s.status, "PREPARING");
  setStatus(id, "PREPARING", { failure_reason: null });
  try {
    const hasQuestions = q.get("SELECT 1 FROM interview_questions WHERE session_id = ?", id);
    if (!hasQuestions) await generateQuestion(s, "primary", 1, 0);
  } catch (e) {
    const err = aiFailure(e);
    setStatus(id, "FAILED", { failure_reason: err instanceof AppError ? err.message : "Unexpected error." });
    throw err;
  }
  setStatus(id, "IN_PROGRESS", { started_at: s.started_at ?? nowIso() });
  audit({ id: user.id, role: user.role }, "interview.start", { type: "interview", id });
  return getState(user, id);
}

export function pauseInterview(user: SessionUser, id: string) {
  const s = getOwnedSession(user.id, id);
  assertTransition(s.status, "PAUSED");
  setStatus(id, "PAUSED", { paused_at: nowIso() });
  return getState(user, id);
}

export function resumeInterview(user: SessionUser, id: string) {
  const s = getOwnedSession(user.id, id);
  if (s.status === "FAILED") {
    assertTransition("FAILED", "IN_PROGRESS");
    setStatus(id, "IN_PROGRESS", { failure_reason: null });
    return getState(user, id);
  }
  assertTransition(s.status, "IN_PROGRESS");
  const pausedMs = s.paused_at ? Date.now() - new Date(s.paused_at).getTime() : 0;
  setStatus(id, "IN_PROGRESS", { paused_at: null, total_paused_ms: s.total_paused_ms + Math.max(0, pausedMs) });
  return getState(user, id);
}

export function cancelInterview(user: SessionUser, id: string) {
  const s = getOwnedSession(user.id, id);
  assertTransition(s.status, "CANCELLED");
  setStatus(id, "CANCELLED");
  audit({ id: user.id, role: user.role }, "interview.cancel", { type: "interview", id });
  return { status: "CANCELLED" as Status };
}

export async function completeInterview(user: SessionUser, id: string) {
  const s = getOwnedSession(user.id, id);
  if (s.status === "COMPLETED") return { status: "COMPLETED" as Status };
  assertTransition(s.status, "COMPLETED");
  const pausedMs = s.status === "PAUSED" && s.paused_at ? Date.now() - new Date(s.paused_at).getTime() : 0;
  setStatus(id, "COMPLETED", { completed_at: nowIso(), paused_at: null, total_paused_ms: s.total_paused_ms + Math.max(0, pausedMs) });
  await buildReport(id);
  audit({ id: user.id, role: user.role }, "interview.complete", { type: "interview", id });
  return { status: "COMPLETED" as Status };
}

// ---------- answers ----------

export type AnswerInput = { questionId: string; text: string; originalText?: string; source: "text" | "speech"; durationMs?: number; skipped?: boolean };

export async function submitAnswer(user: SessionUser, id: string, input: AnswerInput) {
  const s = getOwnedSession(user.id, id);
  if (s.status === "PAUSED") throw conflict("The interview is paused. Resume to continue.", "paused");
  if (s.status !== "IN_PROGRESS") throw conflict("This interview is not accepting answers.", "not_in_progress");
  const qu = q.get<QuestionRow>("SELECT * FROM interview_questions WHERE id = ? AND session_id = ?", input.questionId, id);
  if (!qu) throw notFound("Question not found.");

  const existing = q.get("SELECT id FROM interview_answers WHERE question_id = ?", qu.id);
  if (existing) return { duplicate: true, ...(await getState(user, id)) }; // double-submit or retry after a network drop

  const text = input.skipped ? "" : input.text.trim();
  if (!input.skipped && text.length < 1) throw badRequest("Write or say an answer, or choose Skip.", "answer_required");
  const original = (input.originalText ?? input.text).trim();
  const corrected = !input.skipped && input.source === "speech" && original !== text ? 1 : 0;
  const answerId = uid();
  tx(() => {
    q.run("INSERT INTO interview_answers (id, session_id, question_id, text, original_text, source, corrected, skipped, duration_ms) VALUES (?,?,?,?,?,?,?,?,?)", answerId, id, qu.id, text, original, input.source, corrected, input.skipped ? 1 : 0, input.durationMs ?? null);
    if (!input.skipped) q.run("INSERT INTO transcript_segments (id, session_id, question_id, answer_id, speaker, text, original_text, corrected) VALUES (?,?,?,?, 'candidate', ?,?,?)", uid(), id, qu.id, answerId, text, original, corrected);
  });

  let evaluationFailed = false;
  let missing: string[] = [];
  let score: number | null = null;
  if (!input.skipped) {
    const ev = await evaluateStored(s, qu, answerId, text).catch(() => null);
    if (ev) { missing = ev.missing; score = ev.score; } else evaluationFailed = true;
  }

  const counts = q.get<{ primaries: number; followups: number }>("SELECT SUM(kind = 'primary') primaries, SUM(kind = 'follow_up') followups FROM interview_questions WHERE session_id = ?", id)!;
  let next: { id: string } | null = null;
  const canFollowUp = qu.kind === "primary" && !input.skipped && !evaluationFailed && missing.length > 0 && (score ?? 5) < 3.5 && (counts.followups ?? 0) < Math.floor(s.max_questions / 2);
  try {
    if (canFollowUp) {
      const fu = await runAI({ providerId: (s.provider_id ?? "mock") as ProviderId, operation: "generateFollowUp", sessionId: id }, (p) => p.generateFollowUp({ roleTitle: s.role_title, question: qu.text, answer: text, competencyKey: qu.competency_key, missingEvidence: missing }));
      if (fu.value) {
        const ord = q.get<{ n: number }>("SELECT MAX(ordinal) n FROM interview_questions WHERE session_id = ?", id)!.n + 1;
        const fid = uid();
        q.run("INSERT INTO interview_questions (id, session_id, ordinal, parent_question_id, kind, text, competency_key, rationale, provider_id) VALUES (?,?,?,?, 'follow_up', ?,?,?,?)", fid, id, ord, qu.id, fu.value.text, qu.competency_key, fu.value.rationale, fu.providerUsed);
        q.run("INSERT INTO transcript_segments (id, session_id, question_id, speaker, text, original_text) VALUES (?,?,?,'ai',?,?)", uid(), id, fid, fu.value.text, fu.value.text);
        next = { id: fid };
      }
    }
    if (!next && (counts.primaries ?? 0) < s.max_questions) {
      const ord = q.get<{ n: number }>("SELECT MAX(ordinal) n FROM interview_questions WHERE session_id = ?", id)!.n + 1;
      const gen = await generateQuestion(s, "primary", ord, counts.primaries ?? 1);
      next = { id: gen.id };
    }
  } catch (e) {
    // The answer is saved. Surface a recoverable error; the client can retry via /state or /next.
    throw aiFailure(e);
  }

  if (!next) {
    await completeInterview(user, id);
    return { done: true, evaluationPending: evaluationFailed, ...(await getState(user, id)) };
  }
  return { done: false, evaluationPending: evaluationFailed, ...(await getState(user, id)) };
}

/** If question generation failed after an answer was stored, the client can ask for the next question again. */
export async function ensureNextQuestion(user: SessionUser, id: string) {
  const s = getOwnedSession(user.id, id);
  if (s.status !== "IN_PROGRESS") return getState(user, id);
  const open = q.get("SELECT 1 FROM interview_questions qq WHERE session_id = ? AND NOT EXISTS (SELECT 1 FROM interview_answers a WHERE a.question_id = qq.id)", id);
  if (!open) {
    const primaries = q.get<{ n: number }>("SELECT COUNT(*) n FROM interview_questions WHERE session_id = ? AND kind = 'primary'", id)!.n;
    if (primaries >= s.max_questions) {
      await completeInterview(user, id);
    } else {
      const ord = q.get<{ n: number }>("SELECT MAX(ordinal) n FROM interview_questions WHERE session_id = ?", id)!.n + 1;
      try { await generateQuestion(s, "primary", ord, primaries); } catch (e) { throw aiFailure(e); }
    }
  }
  return getState(user, id);
}

export async function evaluateStored(s: SessionRow, qu: QuestionRow, answerId: string, text: string) {
  const tpl = templateFor(s.interview_type);
  const evIds = json<string[]>(qu.evidence_chunk_ids_json, []);
  const evidence = evIds.length ? q.all<{ id: string; section: string; text: string }>(`SELECT id, section, text FROM resume_chunks WHERE owner_id = ? AND id IN (${evIds.map(() => "?").join(",")})`, s.candidate_id, ...evIds) : [];
  // Only the question, the answer text and cited resume evidence reach the evaluator. Integrity events, camera data and speech confidence never do.
  const run = await runAI({ providerId: (s.provider_id ?? "mock") as ProviderId, operation: "evaluateAnswer", sessionId: s.id }, (p) =>
    p.evaluateAnswer({ roleTitle: s.role_title, interviewType: s.interview_type, question: qu.text, competencyKey: qu.competency_key, answer: text, dimensionKeys: tpl.dimensionKeys, evidence }),
  );
  const e = run.value;
  q.run("DELETE FROM answer_evaluations WHERE answer_id = ?", answerId);
  q.run(
    `INSERT INTO answer_evaluations (id, session_id, question_id, answer_id, competency_key, overall_score, dimension_scores_json, explanation, excerpts_json, missing_evidence_json, suggestions_json, uncertainty, provider_id, assessment_kind)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    uid(), s.id, qu.id, answerId, qu.competency_key, e.overallScore, JSON.stringify(e.dimensions), e.explanation, JSON.stringify(e.excerpts), JSON.stringify(e.missingEvidence), JSON.stringify(e.suggestions), e.uncertainty, run.providerUsed, run.providerUsed === "mock" ? "mock_heuristic" : "ai_assisted",
  );
  return { score: e.overallScore, missing: e.missingEvidence };
}

// ---------- transcript correction ----------

export async function correctTranscript(user: SessionUser, id: string, segmentId: string, text: string) {
  const s = getOwnedSession(user.id, id);
  if (s.status === "CANCELLED") throw conflict("This interview was cancelled.");
  const seg = q.get<{ id: string; answer_id: string | null; question_id: string; speaker: string; text: string }>("SELECT id, answer_id, question_id, speaker, text FROM transcript_segments WHERE id = ? AND session_id = ?", segmentId, id);
  if (!seg || seg.speaker !== "candidate" || !seg.answer_id) throw notFound("Transcript segment not found.");
  const clean = text.trim();
  if (!clean) throw badRequest("Corrected text cannot be empty.");
  tx(() => {
    q.run("UPDATE transcript_segments SET text = ?, corrected = 1 WHERE id = ?", clean, segmentId); // original_text is never touched
    q.run("UPDATE interview_answers SET text = ?, corrected = 1 WHERE id = ?", clean, seg.answer_id);
  });
  const qu = q.get<QuestionRow>("SELECT * FROM interview_questions WHERE id = ?", seg.question_id)!;
  // Re-score from the corrected words so recognition mistakes never count against the candidate.
  await evaluateStored(s, qu, seg.answer_id, clean).catch(() => null);
  if (s.status === "COMPLETED") await buildReport(id);
  audit({ id: user.id, role: user.role }, "transcript.correct", { type: "interview", id });
  return { ok: true };
}

// ---------- state view ----------

export async function getState(user: SessionUser, id: string) {
  const s = getOwnedSession(user.id, id);
  const questions = q.all<QuestionRow>("SELECT * FROM interview_questions WHERE session_id = ? ORDER BY ordinal", id);
  const answers = q.all<{ id: string; question_id: string; text: string; source: string; corrected: number; skipped: number }>("SELECT id, question_id, text, source, corrected, skipped FROM interview_answers WHERE session_id = ?", id);
  const answered = new Set(answers.map((a) => a.question_id));
  const current = questions.find((x) => !answered.has(x.id)) ?? null;
  const sectionFor = (ids: string[]) =>
    ids.length ? [...new Set(q.all<{ section: string }>(`SELECT section FROM resume_chunks WHERE owner_id = ? AND id IN (${ids.map(() => "?").join(",")})`, s.candidate_id, ...ids).map((r) => r.section))] : [];
  const view = (x: QuestionRow) => ({ id: x.id, ordinal: x.ordinal, kind: x.kind, text: x.text, competencyKey: x.competency_key, competencyName: compByKey(x.competency_key).name, needsClarification: !!x.needs_clarification, resumeSections: sectionFor(json<string[]>(x.evidence_chunk_ids_json, [])) });
  const primaries = questions.filter((x) => x.kind === "primary");
  const elapsedMs = s.started_at ? Math.max(0, (s.completed_at ? new Date(s.completed_at).getTime() : s.paused_at ? new Date(s.paused_at).getTime() : Date.now()) - new Date(s.started_at).getTime() - s.total_paused_ms) : 0;
  return {
    id: s.id, status: s.status, roleTitle: s.role_title, interviewType: s.interview_type, difficulty: s.difficulty, durationMin: s.duration_min,
    answerMode: s.answer_mode, demoMode: !!s.demo_mode, providerId: s.provider_id, providerExternal: s.provider_id ? isExternal(s.provider_id) : false,
    failureReason: s.failure_reason, maxQuestions: s.max_questions, primaryAsked: primaries.length, primaryAnswered: primaries.filter((x) => answered.has(x.id)).length,
    current: current ? view(current) : null, history: questions.filter((x) => answered.has(x.id)).map((x) => ({ ...view(x), answer: answers.find((a) => a.question_id === x.id)?.text ?? "", skipped: !!answers.find((a) => a.question_id === x.id)?.skipped })),
    elapsedMs, hasResume: !!s.resume_id, monitoring: json<MonitoringPolicy>(s.monitoring_policy_json, { enabled: false } as MonitoringPolicy), consents: getConsents(id),
    shareWithOrg: !!s.share_with_org, organizationId: s.organization_id, createdAt: s.created_at, completedAt: s.completed_at,
  };
}

export function listInterviews(userId: string) {
  return q.all<SessionRow & { overall: number | null }>("SELECT * FROM interview_sessions WHERE candidate_id = ? ORDER BY created_at DESC", userId).map((s) => {
    const rep = json<{ overall?: number | null }>(s.report_json, {});
    return { id: s.id, roleTitle: s.role_title, interviewType: s.interview_type, difficulty: s.difficulty, status: s.status, demoMode: !!s.demo_mode, overall: rep.overall ?? null, createdAt: s.created_at, completedAt: s.completed_at };
  });
}

export function getTranscript(user: SessionUser, id: string) {
  const s = getOwnedSession(user.id, id);
  const t0 = s.started_at ? new Date(s.started_at).getTime() : new Date(s.created_at).getTime();
  return q.all<{ id: string; speaker: string; text: string; original_text: string; corrected: number; question_id: string | null; created_at: string }>("SELECT * FROM transcript_segments WHERE session_id = ? ORDER BY created_at, rowid", id).map((r) => ({
    id: r.id, speaker: r.speaker, text: r.text, originalText: r.corrected ? r.original_text : undefined, corrected: !!r.corrected, questionId: r.question_id, atMs: Math.max(0, new Date(r.created_at).getTime() - t0),
  }));
}

// ---------- integrity events ----------

export function recordEvent(user: SessionUser, id: string, input: { type: EventType; occurredAt?: string; durationMs?: number; metadata?: Record<string, unknown> }) {
  const s = getOwnedSession(user.id, id);
  if (s.status !== "IN_PROGRESS" && s.status !== "PAUSED") return { recorded: false, reason: "not_active" };
  if (!ALL_EVENT_TYPES.includes(input.type)) throw badRequest("Unknown event type.");
  const consents = getConsents(id);
  const policy = json<MonitoringPolicy>(s.monitoring_policy_json, { enabled: false } as MonitoringPolicy);
  const camera = isCameraType(input.type);
  // No consent, no record. The server enforces this independently of what the browser chooses to send.
  if (camera ? !consents.video_diagnostics : !consents.integrity_monitoring || !policyAllows(policy, input.type)) return { recorded: false, reason: "not_consented_or_not_in_policy" };
  const n = q.get<{ n: number }>("SELECT COUNT(*) n FROM session_events WHERE session_id = ?", id)!.n;
  if (n >= 500) return { recorded: false, reason: "limit" };
  const at = input.occurredAt && !Number.isNaN(Date.parse(input.occurredAt)) ? new Date(input.occurredAt).toISOString() : nowIso();
  const meta = input.type === "clipboard_paste" ? { chars: Number(input.metadata?.chars ?? 0) } : {};
  const eid = uid();
  q.run("INSERT INTO session_events (id, session_id, type, occurred_at, duration_ms, metadata_json, observation, interpretation) VALUES (?,?,?,?,?,?,?,?)", eid, id, input.type, at, input.durationMs ?? null, JSON.stringify(meta), describeEvent(input.type, at, input.durationMs, meta), INTERPRETATION);
  return { recorded: true, id: eid };
}

export function listEvents(sessionId: string) {
  return q.all<{ id: string; type: string; occurred_at: string; duration_ms: number | null; observation: string; interpretation: string; disputed: number; dispute_note: string | null }>("SELECT * FROM session_events WHERE session_id = ? ORDER BY occurred_at", sessionId).map((e) => ({
    id: e.id, type: e.type, occurredAt: e.occurred_at, durationMs: e.duration_ms, observation: e.observation, interpretation: e.interpretation, disputed: !!e.disputed, disputeNote: e.dispute_note,
  }));
}

export function listOwnEvents(user: SessionUser, id: string) {
  getOwnedSession(user.id, id);
  return listEvents(id);
}

export function contestEvent(user: SessionUser, id: string, eventId: string, note: string) {
  getOwnedSession(user.id, id);
  const r = q.run("UPDATE session_events SET disputed = 1, dispute_note = ?, disputed_at = ? WHERE id = ? AND session_id = ?", note.trim().slice(0, 500), nowIso(), eventId, id);
  if (!r.changes) throw notFound("Event not found.");
  audit({ id: user.id, role: user.role }, "event.contest", { type: "interview", id });
  return { ok: true };
}

export function setShare(user: SessionUser, id: string, share: boolean) {
  const s = getOwnedSession(user.id, id);
  if (share && !s.organization_id) throw badRequest("Choose an organization to share with when creating the interview.", "no_org");
  recordConsent(user, id, [{ type: "share_with_org", granted: share }]);
  return { shareWithOrg: share && !!s.organization_id };
}

export function deleteInterview(user: SessionUser, id: string) {
  getOwnedSession(user.id, id);
  q.run("DELETE FROM interview_sessions WHERE id = ?", id); // cascades to questions, answers, transcripts, evaluations, events, consents
  audit({ id: user.id, role: user.role }, "interview.delete", { type: "interview", id });
  return { ok: true };
}
