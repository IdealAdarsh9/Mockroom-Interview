import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { listProviders } from "@/server/ai/router";
import { ProvidersAdmin } from "@/components/ProvidersAdmin";

export const metadata: Metadata = { title: "AI providers" };
export default async function Providers() {
  const user = await requirePageUser(["admin"]);
  return (
    <Shell user={user}>
      <div className="wrap page">
        <PageHead title="AI providers" sub="API keys are encrypted on the server and never sent back to the browser. A fallback receives candidate data only if you mark it as approved for that purpose." />
        <ProvidersAdmin initial={listProviders()} />
      </div>
    </Shell>
  );
}
