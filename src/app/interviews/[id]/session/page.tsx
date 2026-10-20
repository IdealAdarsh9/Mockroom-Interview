import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requirePageUser } from "@/server/auth";
import { getOwnedSession } from "@/server/interview/service";
import { AppError } from "@/server/errors";
import { Room } from "@/components/Room";

export const metadata: Metadata = { title: "Interview room" };
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(["candidate"]);
  const { id } = await params;
  let status: string;
  try { status = getOwnedSession(user.id, id).status; } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  if (status === "COMPLETED") redirect(`/interviews/${id}/results`);
  if (status === "CREATED") redirect(`/interviews/${id}/lobby`);
  return (
    <Shell user={user}>
      <div className="wrap-wide page" style={{ paddingTop: 24 }}><Room id={id} /></div>
    </Shell>
  );
}
