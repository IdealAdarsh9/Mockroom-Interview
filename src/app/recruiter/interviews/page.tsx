import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHead, Empty, TYPE_LABEL } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { listSharedInterviews } from "@/server/interview/report";
import { when } from "@/lib/api";

export const metadata: Metadata = { title: "Shared interviews" };
export default async function RecruiterInterviews() {
  const user = await requirePageUser(["recruiter"]);
  const items = listSharedInterviews(user);
  return (
    <Shell user={user}>
      <div className="wrap page">
        <PageHead title="Shared interviews" />
        <div className="card">{items.length === 0 ? <Empty title="No shared interviews" /> : <div className="scroll-x"><table className="data"><thead><tr><th>Candidate</th><th>Role</th><th>Type</th><th>Completed</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>
          {items.map((i) => <tr key={i.id}><td><strong>{i.candidateName}</strong></td><td>{i.roleTitle}{i.demoMode && <> <span className="badge badge-demo">Demo</span></>}</td><td>{TYPE_LABEL[i.interviewType]}</td><td className="muted">{when(i.completedAt)}</td><td><Link href={`/recruiter/reports/${i.id}`}>Open</Link></td></tr>)}
        </tbody></table></div>}</div>
      </div>
    </Shell>
  );
}
