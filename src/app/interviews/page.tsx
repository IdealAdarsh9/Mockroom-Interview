import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHead, Empty, statusBadge, TYPE_LABEL, fmtScore } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { listInterviews } from "@/server/interview/service";
import { when } from "@/lib/api";
import { DeleteInterviewButton } from "@/components/InterviewActions";

export const metadata: Metadata = { title: "Interviews" };
export default async function Interviews() {
  const user = await requirePageUser(["candidate"]);
  const items = listInterviews(user.id);
  return (
    <Shell user={user}>
      <div className="wrap page">
        <PageHead title="Interviews" actions={<Link className="btn" href="/interviews/new">New interview</Link>} />
        <div className="card">
          {items.length === 0 ? (
            <Empty title="No interviews yet" action={<Link className="btn" href="/interviews/new">New interview</Link>}>Your completed interviews and reports will appear here.</Empty>
          ) : (
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th>Role</th><th>Format</th><th>Status</th><th>Rating</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td><strong>{i.roleTitle}</strong>{i.demoMode && <> <span className="badge badge-demo">Demo</span></>}</td>
                      <td>{TYPE_LABEL[i.interviewType]} · {i.difficulty}</td>
                      <td>{statusBadge(i.status)}</td>
                      <td className="num">{i.status === "COMPLETED" ? fmtScore(i.overall) : ""}</td>
                      <td className="muted">{when(i.createdAt)}</td>
                      <td>
                        <div className="row" style={{ gap: 14 }}>
                          {i.status === "COMPLETED" ? <Link href={`/interviews/${i.id}/results`}>Results</Link> : i.status === "CREATED" ? <Link href={`/interviews/${i.id}/lobby`}>Open lobby</Link> : i.status === "CANCELLED" ? null : <Link href={`/interviews/${i.id}/session`}>Continue</Link>}
                          <DeleteInterviewButton id={i.id} role={i.roleTitle} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
