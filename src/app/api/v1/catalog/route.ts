import { route } from "@/server/http";
import { q } from "@/server/db";
import { COMPETENCIES, ensureCatalog, SCORE_ANCHORS, TEMPLATES } from "@/server/interview/catalog";

export const runtime = "nodejs";
export const GET = route({ roles: ["candidate"] }, async ({ user }) => {
  ensureCatalog();
  return {
    roles: q.all("SELECT id, title, description, level FROM job_roles WHERE is_sample = 1 OR owner_id = ? ORDER BY title", user.id),
    templates: TEMPLATES, competencies: COMPETENCIES.map((c) => ({ key: c.key, name: c.name, description: c.description })), anchors: SCORE_ANCHORS,
    organizations: q.all("SELECT id, name FROM organizations ORDER BY name"),
  };
});
