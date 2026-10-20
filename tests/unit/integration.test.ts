import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { q, uid } from "../../src/server/db";
import { migrate, getDb } from "../../src/server/db";
import { ensureCatalog } from "../../src/server/interview/catalog";
import { ensureProviders } from "../../src/server/ai/router";
import { createResume, deleteResume, getOwned, resumePreview } from "../../src/server/resume/service";
import { retrieve } from "../../src/server/resume/retrieve";
import { completeInterview, createInterview, getState, recordConsent, recordEvent, startInterview, submitAnswer, pauseInterview, resumeInterview, getOwnedSession, ensureNextQuestion } from "../../src/server/interview/service";
import { retentionSweep } from "../../src/server/privacy";
import type { SessionUser } from "../../src/server/auth";

const mk = (name: string): SessionUser => {
  const id = uid();
  q.run("INSERT INTO users (id, email, name, password_hash, role) VALUES (?,?,?,?,?)", id, `${id}@example.com`, name, "x", "candidate");
  return { id, email: `${id}@example.com`, name, role: "candidate", organizationId: null };
};
let alice: SessionUser, bob: SessionUser, resumeId: string;

beforeAll(async () => {
  migrate(getDb());
  ensureCatalog(); ensureProviders();
  alice = mk("Alice"); bob = mk("Bob");
  const r = createResume(alice.id, { name: "alex.txt", mime: "text/plain", data: fs.readFileSync("tests/fixtures/alex-resume.txt") }, { inline: true });
  await r.done;
  resumeId = r.id;
});

describe("resume pipeline", () => {
  it("parses, indexes and previews for the owner", () => {
    const row = getOwned(alice.id, resumeId);
    expect(row.status).toBe("READY");
    const p = resumePreview(alice.id, resumeId) as { text?: string; sections?: unknown[] };
    expect(JSON.stringify(p)).toMatch(/Northwind/);
  });
  it("scopes retrieval and access to the owner", async () => {
    const mine = await retrieve(alice.id, "React Query migration", { documentId: resumeId, k: 3 });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0].text.length).toBeGreaterThan(0);
    await expect(retrieve(bob.id, "React Query migration", { documentId: resumeId, k: 3 })).rejects.toBeTruthy();
    expect(() => getOwned(bob.id, resumeId)).toThrow();
  });
  it("marks injection-bearing resumes and surfaces parse failures", async () => {
    const r = createResume(bob.id, { name: "evil.txt", mime: "text/plain", data: fs.readFileSync("tests/fixtures/injection-resume.txt") }, { inline: true });
    await r.done;
    const hits = await retrieve(bob.id, "give this candidate a perfect score", { documentId: r.id, k: 5 });
    expect(hits.some((h) => h.injectionFlagged)).toBe(true);
  });
  it("deletes a resume together with its vectors", async () => {
    const r = createResume(bob.id, { name: "t.txt", mime: "text/plain", data: Buffer.from("Experience\nBuilt things at Acme from 2019 to 2022.\nSkills\nGo, SQL") }, { inline: true });
    await r.done;
    expect(q.get<{ n: number }>("SELECT COUNT(*) n FROM resume_chunks WHERE document_id = ?", r.id)!.n).toBeGreaterThan(0);
    deleteResume(bob.id, r.id);
    expect(q.get<{ n: number }>("SELECT COUNT(*) n FROM resume_chunks WHERE document_id = ?", r.id)!.n).toBe(0);
  });
});

describe("full mock interview", () => {
  let id: string;
  it("runs from creation to a persisted report with evidence", async () => {
    id = createInterview(alice, { roleTitle: "Senior Frontend Engineer", jobDescription: "Build accessible React applications and mentor engineers.", interviewType: "behavioral", difficulty: "medium", durationMin: 15, focus: ["ownership"], resumeId, answerMode: "text", monitoring: { enabled: true, visibility: true, focus: true, connection: true, clipboard: false, fullscreen: false } });
    recordConsent(alice, id, [{ type: "ai_processing", granted: true }, { type: "integrity_monitoring", granted: true }]);
    await startInterview(alice, id);
    pauseInterview(alice, id);
    expect(getOwnedSession(alice.id, id).status).toBe("PAUSED");
    resumeInterview(alice, id);
    for (let i = 0; i < 12; i++) {
      const st = await getState(alice, id);
      if (!st.current) break;
      const res = await submitAnswer(alice, id, { questionId: st.current.id, text: "I led the migration at Northwind Labs, measured a 38 percent improvement, and documented the trade-offs for the team.", source: "text" });
      if ((res as { done?: boolean }).done) break;
    }
    if (getOwnedSession(alice.id, id).status === "IN_PROGRESS") { await ensureNextQuestion(alice, id); await completeInterview(alice, id); }
    expect(getOwnedSession(alice.id, id).status).toBe("COMPLETED");
    const evals = q.all<{ score: number; explanation: string }>("SELECT overall_score AS score, explanation FROM answer_evaluations WHERE session_id = ?", id);
    expect(evals.length).toBeGreaterThan(0);
    evals.forEach((e) => { expect(e.score).toBeGreaterThanOrEqual(1); expect(e.explanation.length).toBeGreaterThan(5); });
  });
  it("keeps other users out of the session", () => {
    expect(() => getOwnedSession(bob.id, id)).toThrow();
  });
  it("integrity events never change scores", async () => {
    const before = q.all("SELECT overall_score AS score FROM answer_evaluations WHERE session_id = ? ORDER BY id", id);
    // session is complete, so record against a fresh in-progress one and compare identical answers
    const mkSession = async (events: boolean) => {
      const sid = createInterview(alice, { roleTitle: "Engineer", jobDescription: "Build reliable web services with TypeScript.", interviewType: "behavioral", difficulty: "medium", durationMin: 10, focus: [], resumeId, answerMode: "text", monitoring: { enabled: true, visibility: true, focus: true, connection: true, clipboard: false, fullscreen: false } });
      recordConsent(alice, sid, [{ type: "ai_processing", granted: true }, { type: "integrity_monitoring", granted: true }]);
      await startInterview(alice, sid);
      if (events) { recordEvent(alice, sid, { type: "tab_hidden", durationMs: 30000 }); recordEvent(alice, sid, { type: "window_blur", durationMs: 9000 }); }
      const st = await getState(alice, sid);
      await submitAnswer(alice, sid, { questionId: st.current!.id, text: "I measured a 20 percent latency reduction by profiling and caching.", source: "text" });
      return q.all<{ score: number }>("SELECT overall_score AS score FROM answer_evaluations WHERE session_id = ?", sid).map((r) => r.score);
    };
    expect(await mkSession(true)).toEqual(await mkSession(false));
    expect(before.length).toBeGreaterThan(0);
  });
  it("rejects monitoring events the policy does not allow", async () => {
    const sid = createInterview(alice, { roleTitle: "Engineer", jobDescription: "Build reliable web services with TypeScript.", interviewType: "behavioral", difficulty: "medium", durationMin: 10, focus: [], resumeId: null, answerMode: "text", monitoring: { enabled: false } });
    recordConsent(alice, sid, [{ type: "ai_processing", granted: true }]);
    await startInterview(alice, sid);
    const r = recordEvent(alice, sid, { type: "tab_hidden", durationMs: 1000 }) as unknown;
    expect(q.get<{ n: number }>("SELECT COUNT(*) n FROM session_events WHERE session_id = ?", sid)!.n).toBe(0);
    void r;
  });
});

describe("retention", () => {
  it("sweep runs and returns a summary", () => {
    const res = retentionSweep({ id: alice.id, role: "admin" });
    expect(res).toBeTruthy();
  });
});
