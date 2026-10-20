import fs from "node:fs";
import path from "node:path";
import { q, tx, json } from "./db";
import { env } from "./env";
import { audit, type Actor } from "./audit";
import { getSettings } from "./settings";
import type { SessionUser } from "./auth";

/** Everything held about a user, as portable JSON. Embeddings are omitted (derived data, not human readable). */
export function exportUserData(user: SessionUser) {
  const profile = q.get("SELECT headline, target_role, experience_level, accommodations_note, prefers_text_mode FROM candidate_profiles WHERE user_id = ?", user.id) ?? null;
  const resumes = q.all<{ id: string; original_name: string; created_at: string; extracted_text: string | null; status: string }>("SELECT id, original_name, created_at, extracted_text, status FROM resume_documents WHERE owner_id = ?", user.id);
  const sessions = q.all<{ id: string; role_title: string; status: string; created_at: string; report_json: string | null; job_description: string }>("SELECT id, role_title, status, created_at, report_json, job_description FROM interview_sessions WHERE candidate_id = ?", user.id);
  const interviews = sessions.map((s) => ({
    id: s.id, roleTitle: s.role_title, status: s.status, createdAt: s.created_at, jobDescription: s.job_description,
    questions: q.all("SELECT ordinal, kind, text, competency_key FROM interview_questions WHERE session_id = ? ORDER BY ordinal", s.id),
    answers: q.all("SELECT question_id, text, original_text, source, corrected, skipped FROM interview_answers WHERE session_id = ?", s.id),
    transcript: q.all("SELECT speaker, text, original_text, corrected, created_at FROM transcript_segments WHERE session_id = ? ORDER BY created_at", s.id),
    evaluations: q.all("SELECT competency_key, overall_score, explanation, assessment_kind, human_override_score, human_note FROM answer_evaluations WHERE session_id = ?", s.id),
    sessionEvents: q.all("SELECT type, occurred_at, duration_ms, observation, disputed, dispute_note FROM session_events WHERE session_id = ?", s.id),
    report: json(s.report_json, null),
  }));
  const consents = q.all("SELECT session_id, type, granted, policy_version, created_at FROM consent_records WHERE user_id = ? ORDER BY created_at", user.id);
  audit({ id: user.id, role: user.role }, "privacy.export", { type: "user", id: user.id });
  return { exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email, name: user.name, role: user.role }, profile, resumes, interviews, consents };
}

function removeFile(key: string) {
  try { fs.rmSync(path.join(env.uploadDir, key), { force: true }); } catch { /* already gone */ }
}

/** Hard-deletes the account and everything that cascades from it, including uploaded files and vectors. */
export function deleteAccount(user: SessionUser) {
  const files = q.all<{ storage_key: string }>("SELECT storage_key FROM resume_documents WHERE owner_id = ?", user.id);
  tx(() => q.run("DELETE FROM users WHERE id = ?", user.id));
  files.forEach((f) => removeFile(f.storage_key));
  audit({ id: null, role: "system" }, "privacy.account_deleted", { type: "user", id: user.id }, { files: files.length });
  return { deletedFiles: files.length };
}

/** Applies the configured retention windows. Safe to run repeatedly (cron or the admin button). */
export function retentionSweep(actor: Actor, now = new Date()) {
  const s = getSettings().retention;
  const cutoff = (days: number) => new Date(now.getTime() - days * 86400_000).toISOString();
  const oldResumes = q.all<{ id: string; storage_key: string }>("SELECT id, storage_key FROM resume_documents WHERE created_at < ?", cutoff(s.resumeDays));
  tx(() => {
    for (const r of oldResumes) {
      q.run("DELETE FROM resume_chunks WHERE document_id = ?", r.id);
      q.run("DELETE FROM resume_documents WHERE id = ?", r.id);
    }
  });
  oldResumes.forEach((r) => removeFile(r.storage_key));
  const transcripts = q.run("DELETE FROM transcript_segments WHERE created_at < ?", cutoff(s.transcriptDays)).changes;
  const sessions = q.run("DELETE FROM interview_sessions WHERE created_at < ?", cutoff(s.derivedDays)).changes;
  const authSessions = q.run("DELETE FROM auth_sessions WHERE expires_at < ?", now.toISOString()).changes;
  const result = { resumesDeleted: oldResumes.length, transcriptSegmentsDeleted: transcripts, interviewsDeleted: sessions, expiredLoginsRemoved: authSessions };
  audit(actor, "retention.sweep", undefined, result);
  return result;
}
