import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHead, Empty, fmtScore } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { listSharedInterviews } from "@/server/interview/report";

export const metadata: Metadata = { title: "Candidates" };
export default async function Candidates() {
  const user = await requirePageUser(["recruiter"]);
  const items = listSharedInterviews(user);
  const by = new Map<string, { name: string; list: typeof items }>();
  for (const i of items) { const e = by.get(i.candidateId) ?? { name: i.candidateName, list: [] }; e.list.push(i); by.set(i.candidateId, e); }
  return (
    <Shell user={user}>
      <div className="wrap page">
        <PageHead title="Candidates" sub="Only candidates who shared an interview with your organization appear. No résumés or unshared data are exposed here." />
        <div className="card">
          {by.size === 0 ? <Empty title="No candidates yet">Candidates appear after they share a completed interview.</Empty> : (
            <div className="scroll-x"><table className="data"><thead><tr><th>Candidate</th><th>Shared interviews</th><th>Average rating</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>
              {[...by.entries()].map(([id, c]) => <tr key={id}><td><strong>{c.name}</strong></td><td className="num">{c.list.length}</td><td className="num">{fmtScore(c.list.reduce((a, b) => a + (b.overall ?? 0), 0) / c.list.length)}</td><td><Link href={`/recruiter/reports/${c.list[0].id}`}>Latest report</Link></td></tr>)}
            </tbody></table></div>
          )}
        </div>
      </div>
    </Shell>
  );
}
