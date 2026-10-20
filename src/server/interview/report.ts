import { q, json, nowIso } from "../db";
import { runAI } from "../ai/router";
import type { ProviderId } from "../ai/types";
import { tokenize } from "../resume/embed";
import { audit } from "../audit";
import { forbidden, notFound } from "../errors";
import type { SessionUser } from "../auth";
import { compByKey, DIMENSIONS, templateFor, type DimensionKey } from "./catalog";
import { listEvents, evaluateStored, getOwnedSession, type SessionRow } from "./service";

type EvalRow = {
  id: string; question_id: string; answer_id: string; competency_key: string; overall_score: number; dimension_scores_json: string; explanation: string;
  excerpts_json: string; missing_evidence_json: string; suggestions_json: string; uncertainty: string | null; provider_id: string | null;
  assessment_kind: "ai_assisted" | "mock_heuristic"; human_override_score: number | null; human_note: string | null;
};

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const effective = (e: EvalRow) => e.human_override_score ?? e.overall_score;

/**
 * Builds the persisted report. Inputs are questions, answers and evaluations only.
 * Session events are deliberately not read here so they can never influence a score.
 */
export async function buildReport(sessionId: string) {
  const s = q.get<SessionRow>("SELECT * FROM interview_sessions WHERE id = ?", sessionId);
  if (!s) throw notFound();
  const questions = q.all<{ id: string; ordinal: number; kind: string; text: string; competency_key: string; evidence_chunk_ids_json: string; needs_clarification: number }>("SELECT * FROM interview_questions WHERE session_id = ? ORDER BY ordinal", sessionId);
  const answers = q.all<{ id: string; question_id: string; text: string; original_text: string; source: string; corrected: number; skipped: number }>("SELECT * FROM interview_answers WHERE session_id = ?", sessionId);

  // Retry any evaluation that failed earlier (for example a provider outage) before summarising.
  for (const a of answers) {
    if (a.skipped || q.get("SELECT 1 FROM answer_evaluations WHERE answer_id = ?", a.id)) continue;
    const qu = q.get<never>("SELECT * FROM interview_questions WHERE id = ?", a.question_id);
    if (qu) await evaluateStored(s, qu, a.id, a.text).catch(() => null);
  }
  const evals = q.all<EvalRow>("SELECT * FROM answer_evaluations WHERE session_id = ?", sessionId);
  const evByQ = new Map(evals.map((e) => [e.question_id, e]));
  const ansByQ = new Map(answers.map((a) => [a.question_id, a]));
  const tpl = templateFor(s.interview_type);

  const chunkInfo = (ids: string[]) => ids.map((id) => {
    const c = q.get<{ id: string; section: string; text: string }>("SELECT id, section, text FROM resume_chunks WHERE id = ? AND owner_id = ?", id, s.candidate_id);
    return c ? { chunkId: c.id, section: c.section, excerpt: c.text.replace(/\s+/g, " ").slice(0, 220), available: true } : { chunkId: id, section: "removed", excerpt: "", available: false };
  });

  const qOut = questions.map((qu) => {
    const a = ansByQ.get(qu.id);
    const e = evByQ.get(qu.id);
    return {
      questionId: qu.id, ordinal: qu.ordinal, kind: qu.kind, question: qu.text, competencyKey: qu.competency_key, competencyName: compByKey(qu.competency_key).name,
      answered: !!a, skipped: !!a?.skipped, answer: a?.text ?? "", answerSource: a?.source ?? null, corrected: !!a?.corrected,
      evidence: chunkInfo(json<string[]>(qu.evidence_chunk_ids_json, [])),
      evaluation: e ? {
        id: e.id, score: effective(e), aiScore: e.overall_score, humanScore: e.human_override_score, humanNote: e.human_note,
        dimensions: json<{ key: DimensionKey; score: number | null; note: string }[]>(e.dimension_scores_json, []).map((d) => ({ ...d, name: DIMENSIONS[d.key]?.name ?? d.key })),
        explanation: e.explanation, excerpts: json<{ quote: string; supports: string }[]>(e.excerpts_json, []),
        missingEvidence: json<string[]>(e.missing_evidence_json, []), suggestions: json<string[]>(e.suggestions_json, []), uncertainty: e.uncertainty,
        kind: e.assessment_kind, provider: e.provider_id,
      } : null,
    };
  });

  const scored = qOut.filter((x) => x.evaluation);
  const overall = avg(scored.map((x) => x.evaluation!.score));
  const compMap = new Map<string, number[]>();
  for (const x of scored) compMap.set(x.competencyKey, [...(compMap.get(x.competencyKey) ?? []), x.evaluation!.score]);
  const competencies = tpl.competencyKeys.concat([...compMap.keys()].filter((k) => !tpl.competencyKeys.includes(k))).map((k) => ({ key: k, name: compByKey(k).name, score: avg(compMap.get(k) ?? []), questions: (compMap.get(k) ?? []).length }));
  const dimAgg = new Map<string, number[]>();
  for (const x of scored) for (const d of x.evaluation!.dimensions) if (d.score !== null) dimAgg.set(d.key, [...(dimAgg.get(d.key) ?? []), d.score]);
  const dimensions = [...dimAgg.entries()].map(([key, v]) => ({ key, name: DIMENSIONS[key as DimensionKey]?.name ?? key, score: avg(v) }));

  const strengths = scored.flatMap((x) => x.evaluation!.dimensions.filter((d) => (d.score ?? 0) >= 4).slice(0, 1).map((d) => ({ text: `${d.name}: ${x.competencyName}`, quote: x.evaluation!.excerpts[0]?.quote ?? null, questionOrdinal: x.ordinal }))).slice(0, 4);
  const improvements = scored.filter((x) => x.evaluation!.score < 3.5).flatMap((x) => x.evaluation!.suggestions.slice(0, 1).map((t) => ({ text: t, questionOrdinal: x.ordinal }))).slice(0, 4);

  let summary = ""; let practice: string[] = []; let summaryProvider: string | null = null; let summaryError: string | null = null;
  try {
    const run = await runAI({ providerId: (s.provider_id ?? "mock") as ProviderId, operation: "generateFeedback", sessionId }, (p) =>
      p.generateFeedback({ roleTitle: s.role_title, overall, competencies, strengths: strengths.map((x) => x.text), gaps: improvements.map((x) => x.text), answered: answers.filter((a) => !a.skipped).length, total: questions.filter((x) => x.kind === "primary").length }));
    summary = run.value.summary; practice = run.value.practiceQuestions; summaryProvider = run.providerUsed;
  } catch {
    summaryError = "The AI summary could not be generated. Scores and question feedback below are unaffected.";
  }

  const usage = q.all<{ provider_id: string; n: number }>("SELECT provider_id, COUNT(*) n FROM usage_records WHERE session_id = ? AND success = 1 GROUP BY provider_id", sessionId);
  const kinds = new Set(evals.map((e) => e.assessment_kind));

  const report = {
    generatedAt: nowIso(), demoMode: !!s.demo_mode || kinds.has("mock_heuristic"),
    providers: usage.map((u) => ({ id: u.provider_id, calls: u.n })),
    mixedProviders: kinds.size > 1,
    overall, answered: answers.filter((a) => !a.skipped).length, skipped: answers.filter((a) => a.skipped).length, primaryQuestions: questions.filter((x) => x.kind === "primary").length,
    competencies, dimensions, questions: qOut, strengths, improvements, practiceQuestions: practice, summary, summaryProvider, summaryError,
    alignment: alignment(s),
    notices: [
      "AI-assisted assessment. Scores are estimates from the words of each answer and can be wrong. They are not objective measurements.",
      "Accent, speech recognition quality, camera availability, connection quality and session events are never scored.",
      "Hiring or admission decisions require review by a qualified human with full context.",
    ],
  };
  q.run("UPDATE interview_sessions SET report_json = ?, updated_at = ? WHERE id = ?", JSON.stringify(report), nowIso(), sessionId);
  return report;
}

function alignment(s: SessionRow) {
  if (!s.resume_id) return { available: false as const, reason: "No resume was attached to this interview." };
  const chunks = q.all<{ id: string; section: string; text: string }>("SELECT id, section, text FROM resume_chunks WHERE owner_id = ? AND document_id = ?", s.candidate_id, s.resume_id);
  if (!chunks.length) return { available: false as const, reason: "The resume used for this interview has since been removed." };
  const freq = new Map<string, number>();
  for (const t of tokenize(s.job_description)) if (t.length >= 4) freq.set(t, (freq.get(t) ?? 0) + 1);
  const generic = new Set(["experience", "work", "team", "teams", "build", "building", "across", "improve", "ability", "strong", "years", "role", "company", "product", "products", "using", "within", "customer", "customers", "define"]);
  const keywords = [...freq.entries()].filter(([t]) => !generic.has(t)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([t]) => t);
  const items = keywords.map((k) => {
    for (const c of chunks) {
      const line = c.text.split("\n").find((l) => tokenize(l).includes(k));
      if (line) return { keyword: k, evidence: { chunkId: c.id, section: c.section, line: line.replace(/^[\s•*\-–·]+/, "").trim().slice(0, 200) } };
    }
    return { keyword: k, evidence: null };
  });
  const covered = items.filter((i) => i.evidence).length;
  return { available: true as const, items, coveragePct: items.length ? Math.round((covered / items.length) * 100) : 0, note: "Keyword overlap between the job description and the resume. It is not a hiring recommendation." };
}

export function getReportFor(user: SessionUser, id: string) {
  const s = getOwnedSession(user.id, id);
  if (s.status !== "COMPLETED" || !s.report_json) throw notFound("The report is not ready yet.");
  return packReport(s, true);
}

function packReport(s: SessionRow, includeDispute: boolean) {
  const rep = json<Record<string, unknown>>(s.report_json, {});
  return {
    session: { id: s.id, roleTitle: s.role_title, interviewType: s.interview_type, difficulty: s.difficulty, completedAt: s.completed_at, demoMode: !!s.demo_mode, shareWithOrg: !!s.share_with_org, durationMin: s.duration_min },
    report: rep,
    // Kept apart from performance scores on purpose; see the report page.
    sessionEvents: listEvents(s.id).map((e) => (includeDispute ? e : { ...e, disputeNote: e.disputeNote })),
  };
}

/** Recruiters only see completed interviews the candidate explicitly shared with the recruiter's own organization. */
export function getSharedReport(user: SessionUser, id: string) {
  const s = q.get<SessionRow>("SELECT * FROM interview_sessions WHERE id = ?", id);
  if (!s || !user.organizationId || s.organization_id !== user.organizationId || !s.share_with_org || s.status !== "COMPLETED" || !s.report_json) throw notFound("Report not found or not shared with your organization.");
  audit({ id: user.id, role: user.role }, "report.view_shared", { type: "interview", id });
  const cand = q.get<{ name: string }>("SELECT name FROM users WHERE id = ? AND deleted_at IS NULL", s.candidate_id);
  return { ...packReport(s, true), candidate: { name: cand?.name ?? "Candidate" } };
}

export function listSharedInterviews(user: SessionUser) {
  if (!user.organizationId) return [];
  return q.all<SessionRow & { candidate_name: string }>(
    `SELECT s.*, u.name AS candidate_name FROM interview_sessions s JOIN users u ON u.id = s.candidate_id
     WHERE s.organization_id = ? AND s.share_with_org = 1 AND s.status = 'COMPLETED' AND u.deleted_at IS NULL ORDER BY s.completed_at DESC`,
    user.organizationId,
  ).map((s) => ({ id: s.id, candidateId: s.candidate_id, candidateName: s.candidate_name, roleTitle: s.role_title, interviewType: s.interview_type, overall: json<{ overall?: number | null }>(s.report_json, {}).overall ?? null, completedAt: s.completed_at, demoMode: !!s.demo_mode }));
}

export function reviewEvaluation(user: SessionUser, sessionId: string, evaluationId: string, input: { score: number | null; note: string }) {
  const s = q.get<SessionRow>("SELECT * FROM interview_sessions WHERE id = ?", sessionId);
  if (!s || !user.organizationId || s.organization_id !== user.organizationId || !s.share_with_org) throw forbidden();
  const r = q.run("UPDATE answer_evaluations SET human_override_score = ?, human_note = ?, reviewed_by = ? WHERE id = ? AND session_id = ?", input.score, input.note.slice(0, 600), user.id, evaluationId, sessionId);
  if (!r.changes) throw notFound();
  audit({ id: user.id, role: user.role }, "evaluation.human_review", { type: "interview", id: sessionId });
  return { ok: true };
}

export function exportReport(user: SessionUser, id: string, format: "json" | "md") {
  const data = getReportFor(user, id);
  if (format === "json") return { contentType: "application/json", filename: `interview-${id.slice(0, 8)}.json`, body: JSON.stringify(data, null, 2) };
  const r = data.report as { overall: number | null; summary: string; competencies: { name: string; score: number | null }[]; questions: { ordinal: number; question: string; answer: string; evaluation: { score: number; explanation: string } | null }[]; notices: string[] };
  const md = [
    `# Interview report: ${data.session.roleTitle}`,
    `Overall (AI-assisted${data.session.demoMode ? ", demo heuristics" : ""}): ${r.overall ?? "n/a"} / 5`, "",
    r.summary, "", "## Competencies", ...r.competencies.map((c) => `- ${c.name}: ${c.score ?? "n/a"}`), "",
    "## Questions", ...r.questions.flatMap((x) => [`### ${x.ordinal}. ${x.question}`, `Answer: ${x.answer || "(skipped)"}`, x.evaluation ? `Rating ${x.evaluation.score}/5. ${x.evaluation.explanation}` : "Not rated.", ""]),
    "## Session technical events (not scored)", ...(data.sessionEvents.length ? data.sessionEvents.map((e) => `- ${e.observation} ${e.disputed ? "(contested by candidate)" : ""}`) : ["- None recorded."]), "",
    "## Notices", ...r.notices.map((n) => `- ${n}`),
  ].join("\n");
  return { contentType: "text/markdown; charset=utf-8", filename: `interview-${id.slice(0, 8)}.md`, body: md };
}
