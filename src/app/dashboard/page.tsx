import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHead, Empty, statusBadge, TYPE_LABEL, fmtScore } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { listInterviews } from "@/server/interview/service";
import { listResumes } from "@/server/resume/service";

export const metadata: Metadata = { title: "Dashboard" };
export default async function Dashboard() {
  const user = await requirePageUser(["candidate"]);
  const interviews = listInterviews(user.id);
  const resumes = listResumes(user.id);
  const ready = resumes.find((r) => r.status === "READY");
  const done = interviews.filter((i) => i.status === "COMPLETED" && i.overall !== null);
  const avg = done.length ? done.reduce((a, b) => a + (b.overall ?? 0), 0) / done.length : null;
  const open = interviews.find((i) => ["CREATED", "IN_PROGRESS", "PAUSED", "FAILED"].includes(i.status));
  return (
    <Shell user={user}>
      <div className="wrap page">
        <PageHead title={`Welcome, ${user.name.split(" ")[0]}`} sub="Upload a résumé, set up an interview, and review feedback tied to your own answers." actions={<Link className="btn" href="/interviews/new">New interview</Link>} />
        <div className="grid grid-3">
          <div className="card stack">
            <h2 className="section-title">Résumé</h2>
            {ready ? <><p>{ready.name}</p><p className="muted t-caption">{ready.sections.length} sections · {ready.chunkCount} indexed passages</p><Link href="/resume">Manage résumé</Link></> : resumes.length ? <><p className="muted">Your résumé is {resumes[0].status === "FAILED" ? "not usable. See the reason and try another file." : "still processing."}</p><Link href="/resume">View status</Link></> : <><p className="muted">No résumé yet. Questions will be role-based until you add one.</p><Link href="/resume">Upload a résumé</Link></>}
          </div>
          <div className="card stack">
            <h2 className="section-title">Practice so far</h2>
            <p className="t-section num">{done.length} completed</p>
            <p className="muted t-caption">{avg === null ? "No rated interviews yet." : `Average rating ${fmtScore(avg)} of 5 (AI-assisted estimate)`}</p>
          </div>
          <div className="card stack">
            <h2 className="section-title">Pick up where you left off</h2>
            {open ? <><p>{open.roleTitle}</p><p>{statusBadge(open.status)}</p><Link href={open.status === "CREATED" ? `/interviews/${open.id}/lobby` : `/interviews/${open.id}/session`}>Continue</Link></> : <p className="muted">Nothing in progress.</p>}
          </div>
        </div>
        <h2 className="section-title" style={{ margin: "40px 0 12px" }}>Recent interviews</h2>
        <div className="card">
          {interviews.length === 0 ? (
            <Empty title="No interviews yet" action={<Link className="btn" href="/interviews/new">Set up your first interview</Link>}>It takes about two minutes. You choose the role, the format and what to share.</Empty>
          ) : (
            <div className="list-rows">
              {interviews.slice(0, 5).map((i) => (
                <div key={i.id} className="row" style={{ justifyContent: "space-between" }}>
                  <div><strong>{i.roleTitle}</strong> <span className="muted t-caption">{TYPE_LABEL[i.interviewType]} · {i.difficulty}</span>{i.demoMode && <> <span className="badge badge-demo">Demo</span></>}</div>
                  <div className="row">{statusBadge(i.status)}{i.status === "COMPLETED" && <Link href={`/interviews/${i.id}/results`}>View results</Link>}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
