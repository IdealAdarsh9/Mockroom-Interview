import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { q } from "@/server/db";
import { getSettings } from "@/server/settings";
import { SettingsForm } from "@/components/SettingsForm";

export const metadata: Metadata = { title: "Settings" };
export default async function SettingsPage() {
  const user = await requirePageUser(["candidate"]);
  const p = q.get<{ headline: string | null; target_role: string | null; experience_level: string | null; accommodations_note: string | null; prefers_text_mode: number }>("SELECT * FROM candidate_profiles WHERE user_id = ?", user.id);
  const ret = getSettings().retention;
  return (
    <Shell user={user}>
      <div className="wrap page" style={{ maxWidth: 800 }}>
        <PageHead title="Settings" sub={user.email} />
        <SettingsForm profile={{ headline: p?.headline ?? "", targetRole: p?.target_role ?? "", experienceLevel: p?.experience_level ?? "", accommodationsNote: p?.accommodations_note ?? "", prefersTextMode: !!p?.prefers_text_mode }} retention={ret} />
      </div>
    </Shell>
  );
}
