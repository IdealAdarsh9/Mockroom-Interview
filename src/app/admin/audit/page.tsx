import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { PageHead, Empty } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { q } from "@/server/db";
import { when } from "@/lib/api";

export const metadata: Metadata = { title: "Audit log" };
export default async function Audit({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const user = await requirePageUser(["admin"]);
  const { action } = await searchParams;
  const clean = (action ?? "").replace(/[^a-z._]/gi, "");
  const rows = q.all<{ id: string; actor_role: string | null; action: string; target_type: string | null; target_id: string | null; metadata_json: string; created_at: string }>(`SELECT * FROM audit_events ${clean ? "WHERE action LIKE ?" : ""} ORDER BY created_at DESC LIMIT 200`, ...(clean ? [`${clean}%`] : []));
  return (
    <Shell user={user}>
      <div className="wrap page">
        <PageHead title="Audit log" sub="Privileged and data-affecting actions. Metadata never contains secrets, résumé text or transcripts." />
        <form className="row" style={{ marginBottom: 16 }} role="search"><div className="field" style={{ minWidth: 240 }}><label htmlFor="a" className="sr-only">Filter by action prefix</label><input id="a" name="action" className="input" defaultValue={clean} placeholder="Filter by action, e.g. provider" /></div><button className="btn btn-sm">Filter</button></form>
        <div className="card scroll-x">{rows.length === 0 ? <Empty title="No events" /> : <table className="data"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td className="muted">{when(r.created_at)}</td><td>{r.actor_role ?? "system"}</td><td><code>{r.action}</code></td><td className="muted t-caption">{r.target_type}{r.target_id ? ` ${r.target_id.slice(0, 8)}` : ""}</td><td className="muted t-caption">{r.metadata_json === "{}" ? "" : r.metadata_json}</td></tr>)}</tbody></table>}</div>
      </div>
    </Shell>
  );
}
