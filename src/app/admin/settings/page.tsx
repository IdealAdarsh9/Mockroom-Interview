import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { AdminSettings } from "@/components/AdminSettings";

export const metadata: Metadata = { title: "Platform settings" };
export default async function AdminSettingsPage() {
  const user = await requirePageUser(["admin"]);
  return (
    <Shell user={user}>
      <div className="wrap page" style={{ maxWidth: 800 }}>
        <PageHead title="Platform settings" sub="Retention windows and default monitoring policy. Applicable privacy and employment law is your deployment's responsibility." />
        <AdminSettings initial={getSettings()} />
      </div>
    </Shell>
  );
}
