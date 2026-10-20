import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ReportView } from "@/components/ReportView";
import { ReviewForm } from "@/components/ReviewForm";
import { requirePageUser } from "@/server/auth";
import { getSharedReport } from "@/server/interview/report";
import { AppError } from "@/server/errors";

export const metadata: Metadata = { title: "Candidate report" };
export default async function RecruiterReport({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(["recruiter"]);
  const { id } = await params;
  let data;
  try { data = getSharedReport(user, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  return (
    <Shell user={user}>
      <div className="wrap page">
        <p><Link href="/recruiter/reports">← All reports</Link></p>
        <div className="page-head"><div><h1 className="t-display">{data.candidate.name}</h1><p className="muted" style={{ marginTop: 6 }}>{data.session.roleTitle}</p></div></div>
        <div className="notice notice-warn" style={{ marginBottom: 20 }}>This report was shared by the candidate. Ratings are AI-assisted and not a hiring decision. A qualified person must review them with full context. Session events are unverified and unscored. Do not treat them as misconduct.</div>
        <ReportView data={data} reviewSlot={(evalId, cur) => <ReviewForm interviewId={id} evaluationId={evalId} current={cur} />} />
      </div>
    </Shell>
  );
}
