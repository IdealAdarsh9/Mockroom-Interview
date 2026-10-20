import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHead, Empty, fmtScore } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { listSharedInterviews } from "@/server/interview/report";

export const metadata: Metadata = { title: "Reports" };
export default async function Reports() {
  const user = await requirePageUser(["recruiter"]);
  const items = listSharedInterviews(user);
  return (
    <Shell user={user}>
      <div className="wrap page">
        <PageHead title="Reports" sub="Review the evidence behind each rating and, where you disagree, record your own." />
        {items.length === 0 ? <div className="card"><Empty title="No reports yet" /></div> : <div className="grid grid-3">{items.map((i) => <Link key={i.id} href={`/recruiter/reports/${i.id}`} className="card stack" style={{ color: "inherit", textDecoration: "none" }}><strong>{i.candidateName}</strong><span className="muted t-caption">{i.roleTitle}</span><span className="t-section num">{fmtScore(i.overall)} <span className="muted t-caption">/ 5 AI-assisted</span></span></Link>)}</div>}
      </div>
    </Shell>
  );
}
