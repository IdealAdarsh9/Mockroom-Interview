import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ReportView } from "@/components/ReportView";
import { requirePageUser } from "@/server/auth";
import { getReportFor } from "@/server/interview/report";
import { getOwnedSession, getTranscript } from "@/server/interview/service";
import { AppError } from "@/server/errors";
import { ResultsActions, ContestButton } from "@/components/ResultsActions";
import { DeleteInterviewButton } from "@/components/InterviewActions";

export const metadata: Metadata = { title: "Interview results" };
export default async function Results({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(["candidate"]);
  const { id } = await params;
  let data, s;
  try { s = getOwnedSession(user.id, id); data = getReportFor(user, id); } catch (e) { if (e instanceof AppError) {
    if (e.status === 404 && s) return (<Shell user={user}><div className="wrap page"><div className="card"><h1 className="t-display">Report not ready</h1><p className="muted" style={{ margin: "8px 0 16px" }}>This interview has not been completed.</p><Link className="btn" href={`/interviews/${id}/session`}>Return to the room</Link></div></div></Shell>);
    notFound(); } throw e; }
  const transcript = getTranscript(user, id);
  return (
    <Shell user={user}>
      <div className="wrap page">
        <div className="page-head">
          <div><h1 className="t-display">{data.session.roleTitle}</h1><p className="muted" style={{ marginTop: 6 }}>Results {data.session.demoMode && <span className="badge badge-demo">Demo</span>}</p></div>
          <ResultsActions id={id} share={data.session.shareWithOrg} canShare={!!s.organization_id} />
        </div>
        <ReportView data={data} transcript={transcript} eventsSlot={(e) => <ContestButton interviewId={id} eventId={e.id} disabled={e.disputed} />} />
        <div className="card" style={{ marginTop: 28 }}><div className="row" style={{ justifyContent: "space-between" }}><div><h2 className="section-title">Delete this interview</h2><p className="muted t-caption">Removes the transcript, ratings, events and report permanently.</p></div><DeleteInterviewButton id={id} role={data.session.roleTitle} after="/interviews" /></div></div>
      </div>
    </Shell>
  );
}
