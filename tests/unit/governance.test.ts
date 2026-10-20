import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { q, uid, migrate, getDb } from "../../src/server/db";
import { ensureCatalog } from "../../src/server/interview/catalog";
import { ensureProviders, runAI } from "../../src/server/ai/router";
import { createResume } from "../../src/server/resume/service";
import { correctTranscript, createInterview, getState, recordConsent, recordEvent, startInterview, submitAnswer, completeInterview, ensureNextQuestion, listEvents } from "../../src/server/interview/service";
import { buildReport } from "../../src/server/interview/report";
import { deleteAccount } from "../../src/server/privacy";
import type { SessionUser } from "../../src/server/auth";

const mk = (name: string): SessionUser => {
  const id = uid();
  q.run("INSERT INTO users (id, email, name, password_hash, role) VALUES (?,?,?,?,?)", id, `${id}@example.com`, name, "x", "candidate");
  return { id, email: `${id}@example.com`, name, role: "candidate", organizationId: null };
};
beforeAll(() => { migrate(getDb()); ensureCatalog(); ensureProviders(); });

describe("provider failure and fallback", () => {
  it("fails with a clear error when the external provider has no key and no fallback is configured", async () => {
    q.run("UPDATE provider_configurations SET is_fallback = 0");
    await expect(runAI({ providerId: "openai", operation: "test" }, async (p) => p.id)).rejects.toThrow();
  });
  it("falls back only to an explicitly configured, permitted provider and records it", async () => {
    q.run("UPDATE provider_configurations SET is_fallback = 0");
    q.run("UPDATE provider_configurations SET is_fallback = 1, enabled = 1 WHERE id = 'mock'");
    const run = await runAI({ providerId: "openai", operation: "test" }, async (p) => p.id);
    expect(run.providerUsed).toBe("mock");
    expect(run.fellBackFrom).toBe("openai");
    expect(q.get("SELECT 1 FROM audit_events WHERE action = 'ai.fallback'")).toBeTruthy();
    q.run("UPDATE provider_configurations SET is_fallback = 0");
  });
});

describe("transcript correction, report and deletion", () => {
  let u: SessionUser, sid: string;
  it("keeps the original recognition text and rescoring uses corrected words", async () => {
    u = mk("Dee");
    const r = createResume(u.id, { name: "r.txt", mime: "text/plain", data: fs.readFileSync("tests/fixtures/alex-resume.txt") }, { inline: true });
    await r.done;
    sid = createInterview(u, { roleTitle: "Engineer", jobDescription: "Build reliable web services with TypeScript.", interviewType: "behavioral", difficulty: "medium", durationMin: 10, focus: [], resumeId: r.id, answerMode: "text", monitoring: { enabled: true, visibility: true, focus: true, connection: true, clipboard: false, fullscreen: false } });
    recordConsent(u, sid, [{ type: "ai_processing", granted: true }, { type: "integrity_monitoring", granted: true }]);
    await startInterview(u, sid);
    const st = await getState(u, sid);
    await submitAnswer(u, sid, { questionId: st.current!.id, text: "I lead a mirage ration of the checkout app", originalText: "I lead a mirage ration of the checkout app", source: "speech" });
    recordEvent(u, sid, { type: "tab_hidden", durationMs: 12000 });
    const seg = q.get<{ id: string; original_text: string | null }>("SELECT id, original_text FROM transcript_segments WHERE session_id = ? AND speaker = 'candidate'", sid)!;
    await correctTranscript(u, sid, seg.id, "I led a migration of the checkout app and measured a 30 percent improvement.");
    const after = q.get<{ text: string; original_text: string | null; corrected: number }>("SELECT text, original_text, corrected FROM transcript_segments WHERE id = ?", seg.id)!;
    expect(after.corrected).toBe(1);
    expect(after.original_text).toMatch(/mirage/);
    expect(after.text).toMatch(/migration/);
  });
  it("report separates technical events from scores and labels the assessment", async () => {
    await ensureNextQuestion(u, sid).catch(() => null);
    await completeInterview(u, sid);
    const rep = (await buildReport(sid)) as unknown as Record<string, unknown>;
    const text = JSON.stringify(rep);
    expect(text).not.toMatch(/tab was hidden/); // the scored report never reads session events
    expect(text).toMatch(/never scored/i);
    const ev = listEvents(sid);
    expect(JSON.stringify(ev)).toMatch(/Browser tab was hidden/);
    expect(text.toLowerCase()).not.toMatch(/cheat|dishonest/);
  });
  it("account deletion removes sessions, resumes, chunks and answers", () => {
    const res = deleteAccount(u);
    expect(res.deletedFiles).toBeGreaterThan(0);
    for (const t of ["interview_sessions", "resume_documents"]) {
      expect(q.get<{ n: number }>(`SELECT COUNT(*) n FROM ${t} WHERE ${t === "interview_sessions" ? "candidate_id" : "owner_id"} = ?`, u.id)!.n).toBe(0);
    }
    expect(q.get<{ n: number }>("SELECT COUNT(*) n FROM answer_evaluations WHERE session_id = ?", sid)!.n).toBe(0);
    expect(q.get<{ n: number }>("SELECT COUNT(*) n FROM transcript_segments WHERE session_id = ?", sid)!.n).toBe(0);
  });
});
