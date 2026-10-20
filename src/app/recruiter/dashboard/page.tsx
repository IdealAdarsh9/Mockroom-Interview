import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHead, Empty, fmtScore, TYPE_LABEL } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { listSharedInterviews } from "@/server/interview/report";
import { when } from "@/lib/api";

export const metadata: Metadata = { title: "Recruiter dashboard" };
export default async function RecruiterDashboard() {
  const user = await requirePageUser(["recruiter"]);
  const items = listSharedInterviews(user);
  const cands = new Set(items.map((i) => i.candidateId)).size;
  return (
    <Shell user={user}>
      <div className="wrap page">
        <PageHead title="Recruiter dashboard" sub="You only see interviews that candidates chose to share with your organization." />
        <div className="grid grid-3">
          <div className="card"><p className="muted t-caption">Shared candidates</p><p className="t-hero num">{cands}</p></div>
          <div className="card"><p className="muted t-caption">Shared interviews</p><p className="t-hero num">{items.length}</p></div>
          <div className="card"><p className="muted t-caption">Average rating (AI-assisted)</p><p className="t-hero num">{fmtScore(items.length ? items.reduce((a, b) => a + (b.overall ?? 0), 0) / items.length : null)}</p></div>
        </div>
        <div className="notice notice-info" style={{ marginTop: 20 }}>Ratings are AI-assisted estimates. Use them as one input alongside your own review. They are not hiring recommendations, and session events never affect them.</div>
        <h2 className="section-title" style={{ margin: "32px 0 12px" }}>Latest shared</h2>
        <div className="card">{items.length === 0 ? <Empty title="Nothing shared yet">When a candidate shares a finished interview with your organization it appears here.</Empty> : <div className="list-rows">{items.slice(0, 5).map((i) => <div key={i.id} className="row" style={{ justifyContent: "space-between" }}><div><strong>{i.candidateName}</strong> <span className="muted t-caption">{i.roleTitle} · {TYPE_LABEL[i.interviewType]} · {when(i.completedAt)}</span>{i.demoMode && <> <span className="badge badge-demo">Demo</span></>}</div><Link href={`/recruiter/reports/${i.id}`}>Open report</Link></div>)}</div>}</div>
      </div>
    </Shell>
  );
}
