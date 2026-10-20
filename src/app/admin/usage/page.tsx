import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { PageHead, Empty } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { q } from "@/server/db";
import { when } from "@/lib/api";

export const metadata: Metadata = { title: "Usage" };
export default async function Usage() {
  const user = await requirePageUser(["admin"]);
  const by = q.all<{ provider: string; operation: string; requests: number; failures: number; avgLatencyMs: number; inputTokens: number; outputTokens: number }>("SELECT provider_id AS provider, operation, COUNT(*) AS requests, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures, ROUND(AVG(latency_ms)) AS avgLatencyMs, COALESCE(SUM(input_tokens),0) AS inputTokens, COALESCE(SUM(output_tokens),0) AS outputTokens FROM usage_records GROUP BY provider_id, operation ORDER BY requests DESC");
  const recent = q.all<{ provider_id: string; operation: string; latency_ms: number; success: number; error_code: string | null; created_at: string }>("SELECT provider_id, operation, latency_ms, success, error_code, created_at FROM usage_records ORDER BY created_at DESC LIMIT 20");
  return (
    <Shell user={user}>
      <div className="wrap page">
        <PageHead title="Usage" sub="Request counts, failures, latency and token use per provider and operation. Prompts and answers are not stored here." />
        <div className="card scroll-x">{by.length === 0 ? <Empty title="No requests yet" /> : <table className="data"><thead><tr><th>Provider</th><th>Operation</th><th>Requests</th><th>Failures</th><th>Avg latency</th><th>Tokens in / out</th></tr></thead><tbody>{by.map((r, i) => <tr key={i}><td>{r.provider}</td><td>{r.operation}</td><td className="num">{r.requests}</td><td className="num">{r.failures}</td><td className="num">{r.avgLatencyMs} ms</td><td className="num">{r.inputTokens} / {r.outputTokens}</td></tr>)}</tbody></table>}</div>
        <h2 className="section-title" style={{ margin: "32px 0 12px" }}>Recent requests</h2>
        <div className="card scroll-x"><table className="data"><thead><tr><th>When</th><th>Provider</th><th>Operation</th><th>Result</th><th>Latency</th></tr></thead><tbody>{recent.map((r, i) => <tr key={i}><td className="muted">{when(r.created_at)}</td><td>{r.provider_id}</td><td>{r.operation}</td><td>{r.success ? <span className="badge badge-ok">ok</span> : <span className="badge badge-err">{r.error_code}</span>}</td><td className="num">{r.latency_ms} ms</td></tr>)}</tbody></table></div>
      </div>
    </Shell>
  );
}
