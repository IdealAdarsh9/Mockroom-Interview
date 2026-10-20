import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { q } from "@/server/db";
import { COMPETENCIES, ensureCatalog, TEMPLATES } from "@/server/interview/catalog";
import { listResumes } from "@/server/resume/service";
import { getSettings } from "@/server/settings";
import { InterviewSetup } from "@/components/InterviewSetup";

export const metadata: Metadata = { title: "New interview" };
export default async function NewInterview() {
  const user = await requirePageUser(["candidate"]);
  ensureCatalog();
  const roles = q.all<{ id: string; title: string; description: string }>("SELECT id, title, description FROM job_roles WHERE is_sample = 1 OR owner_id = ? ORDER BY title", user.id);
  const prof = q.get<{ prefers_text_mode: number }>("SELECT prefers_text_mode FROM candidate_profiles WHERE user_id = ?", user.id);
  return (
    <Shell user={user}>
      <div className="wrap page" style={{ maxWidth: 860 }}>
        <PageHead title="New interview" sub="Choose what to practise. You review consent and test your devices on the next screen before anything starts." />
        <InterviewSetup
          roles={roles}
          templates={TEMPLATES.map((t) => ({ type: t.interviewType, name: t.name, description: t.description }))}
          competencies={COMPETENCIES.map((c) => ({ key: c.key, name: c.name }))}
          resumes={listResumes(user.id).filter((r) => r.status === "READY").map((r) => ({ id: r.id, name: r.name }))}
          organizations={q.all<{ id: string; name: string }>("SELECT id, name FROM organizations ORDER BY name")}
          defaults={getSettings().monitoringDefaults}
          prefersText={!!prof?.prefers_text_mode}
        />
      </div>
    </Shell>
  );
}
