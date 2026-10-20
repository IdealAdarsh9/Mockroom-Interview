import { route, parseJson } from "@/server/http";
import { q } from "@/server/db";
import { profileSchema } from "@/server/schemas";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const PATCH = route({ roles: ["candidate"], limit: [30, 60_000] }, async ({ req, user }) => {
  const b = await parseJson(req, profileSchema);
  q.run(
    `UPDATE candidate_profiles SET headline = COALESCE(?, headline), target_role = COALESCE(?, target_role), experience_level = COALESCE(?, experience_level),
     accommodations_note = COALESCE(?, accommodations_note), prefers_text_mode = COALESCE(?, prefers_text_mode), updated_at = ? WHERE user_id = ?`,
    b.headline ?? null, b.targetRole ?? null, b.experienceLevel ?? null, b.accommodationsNote ?? null, b.prefersTextMode === undefined ? null : b.prefersTextMode ? 1 : 0, new Date().toISOString(), user.id,
  );
  audit({ id: user.id, role: user.role }, "profile.update", { type: "user", id: user.id });
  return { ok: true };
});
