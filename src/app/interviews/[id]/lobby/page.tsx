import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requirePageUser } from "@/server/auth";
import { getState } from "@/server/interview/service";
import { AppError } from "@/server/errors";
import { Lobby } from "@/components/Lobby";

export const metadata: Metadata = { title: "Interview lobby" };
export default async function LobbyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(["candidate"]);
  const { id } = await params;
  const st = await getState(user, id).catch((e) => { if (e instanceof AppError) return null; throw e; });
  if (!st) notFound();
  if (st.status === "COMPLETED") redirect(`/interviews/${id}/results`);
  return (
    <Shell user={user}>
      <div className="wrap page" style={{ maxWidth: 860 }}>
        <Lobby state={{ id: st.id, status: st.status, roleTitle: st.roleTitle, answerMode: st.answerMode, providerId: st.providerId, providerExternal: st.providerExternal, demoMode: st.demoMode, monitoring: st.monitoring, consents: st.consents, organizationId: st.organizationId, durationMin: st.durationMin, hasResume: st.hasResume, failureReason: st.failureReason }} />
      </div>
    </Shell>
  );
}
