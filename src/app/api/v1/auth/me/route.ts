import { route } from "@/server/http";
import { q } from "@/server/db";

export const runtime = "nodejs";
export const GET = route({}, async ({ user }) => ({
  user,
  profile: q.get("SELECT headline, target_role AS targetRole, experience_level AS experienceLevel, accommodations_note AS accommodationsNote, prefers_text_mode AS prefersTextMode FROM candidate_profiles WHERE user_id = ?", user.id) ?? null,
}));
