/**
 * Demo data. Everything created here runs through the same services as real use, on the built-in mock provider.
 * Demo accounts use publicly documented passwords: never run this against a real deployment.
 */
import fs from "node:fs";
import path from "node:path";
import { q, uid, closeDb } from "../src/server/db";
import { hashPassword } from "../src/server/crypto";
import { ensureCatalog } from "../src/server/interview/catalog";
import { ensureProviders } from "../src/server/ai/router";
import { createResume } from "../src/server/resume/service";
import { completeInterview, createInterview, ensureNextQuestion, recordConsent, startInterview, submitAnswer, getState } from "../src/server/interview/service";
import type { SessionUser } from "../src/server/auth";

// Seeding publishes accounts with publicly documented passwords. It is blocked in production unless a public
// demo deployment opts in explicitly (ALLOW_DEMO_SEED=true) and no real provider is the default.
if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("Refusing to seed demo accounts in production. Set ALLOW_DEMO_SEED=true only for a public demo with fake data.");
  process.exit(1);
}

export const DEMO = {
  password: "DemoPass12345",
  candidate: "demo.candidate@example.com",
  recruiter: "demo.recruiter@example.com",
  admin: "demo.admin@example.com",
};

async function ensureUser(email: string, name: string, role: SessionUser["role"]) {
  const existing = q.get<{ id: string }>("SELECT id FROM users WHERE email = ?", email);
  if (existing) return existing.id;
  const id = uid();
  q.run("INSERT INTO users (id, email, name, password_hash, role) VALUES (?,?,?,?,?)", id, email, name, await hashPassword(DEMO.password), role);
  if (role === "candidate") q.run("INSERT INTO candidate_profiles (user_id, headline, target_role, experience_level) VALUES (?,?,?,?)", id, "Frontend engineer", "Senior Frontend Engineer", "senior");
  return id;
}

const ANSWERS = [
  "At Northwind Labs I led the migration of our 400k-line checkout application from Redux to React Query. I owned the plan, broke it into milestones, and measured the result: average page load time dropped by 38 percent. The trade-off was a slower first sprint, so I shipped the riskiest screens behind a flag first.",
  "On a charting library memory leak, I reproduced it with a heap profile, isolated the cause to listeners that were never removed, wrote a regression test and shipped the fix in two days. I then documented the diagnosis steps for the team so the next investigation was faster.",
  "I partnered with design and product on a redesigned onboarding flow. I raised accessibility concerns early, we agreed on measurable goals, and activation increased by 14 percent. When we disagreed about scope I used user-research evidence to settle it.",
  "I mentor four engineers. I pair on their first pull requests, then step back, and I introduced contract testing with Playwright, which reduced production regressions by 27 percent.",
  "I keep learning by maintaining an open-source accessibility linter, where reviewing contributor feedback taught me to design simpler rules and clearer error messages.",
];

async function main() {
  ensureCatalog();
  ensureProviders();
  const candidateId = await ensureUser(DEMO.candidate, "Alex Rivera (demo)", "candidate");
  const recruiterId = await ensureUser(DEMO.recruiter, "Sam Okafor (demo recruiter)", "recruiter");
  await ensureUser(DEMO.admin, "Dana Whitfield (demo admin)", "admin");

  let orgId = q.get<{ id: string }>("SELECT id FROM organizations WHERE name = 'Northwind Demo Org'")?.id;
  if (!orgId) {
    orgId = uid();
    q.run("INSERT INTO organizations (id, name) VALUES (?, 'Northwind Demo Org')", orgId);
  }
  q.run("INSERT OR IGNORE INTO memberships (id, user_id, organization_id, role) VALUES (?,?,?, 'recruiter')", uid(), recruiterId, orgId);

  const user: SessionUser = { id: candidateId, email: DEMO.candidate, name: "Alex Rivera (demo)", role: "candidate", organizationId: null };

  if (!q.get("SELECT 1 FROM resume_documents WHERE owner_id = ?", candidateId)) {
    const data = fs.readFileSync(path.resolve("tests/fixtures/alex-resume.txt"));
    const r = createResume(candidateId, { name: "alex-rivera-resume.txt", mime: "text/plain", data }, { inline: true });
    await r.done;
  }
  const resume = q.get<{ id: string }>("SELECT id FROM resume_documents WHERE owner_id = ? AND status = 'READY' LIMIT 1", candidateId);

  if (!q.get("SELECT 1 FROM interview_sessions WHERE candidate_id = ?", candidateId)) {
    const role = q.get<{ id: string }>("SELECT id FROM job_roles WHERE is_sample = 1 AND title = 'Senior Frontend Engineer'");
    const id = createInterview(user, {
      roleId: role?.id, interviewType: "behavioral", difficulty: "medium", durationMin: 20, focus: ["ownership", "collaboration"],
      resumeId: resume?.id ?? null, answerMode: "text", shareOrgId: orgId,
      monitoring: { enabled: true, visibility: true, focus: true, connection: true, clipboard: false, fullscreen: false },
    });
    recordConsent(user, id, [{ type: "ai_processing", granted: true }, { type: "integrity_monitoring", granted: true }, { type: "share_with_org", granted: true }]);
    await startInterview(user, id);
    for (let i = 0; i < 12; i++) {
      const st = await getState(user, id);
      if (st.status !== "IN_PROGRESS" || !st.current) break;
      const res = await submitAnswer(user, id, { questionId: st.current.id, text: ANSWERS[i % ANSWERS.length], source: "text" });
      if ((res as { done?: boolean }).done) break;
    }
    const st = await getState(user, id);
    if (st.status === "IN_PROGRESS") { await ensureNextQuestion(user, id); await completeInterview(user, id); }
  }
  console.log("Seeded demo data (mock provider). Demo sign-ins, all with password " + DEMO.password + ":");
  console.log(`  candidate  ${DEMO.candidate}\n  recruiter  ${DEMO.recruiter}\n  admin      ${DEMO.admin}`);
  closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
