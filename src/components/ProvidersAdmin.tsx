"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";

type P = { id: string; displayName: string; enabled: boolean; model: string; hasKey: boolean; keySource: string; isDefault: boolean; isFallback: boolean; candidateDataOk: boolean; baseUrl: string | null; timeoutMs: number; capabilities: { streaming: boolean; structuredOutput: string; sendsDataExternally: boolean }; metrics: { requests7d: number; failures7d: number; avgLatencyMs: number | null; lastError: { error_code: string; created_at: string } | null } };

export function ProvidersAdmin({ initial }: { initial: P[] }) {
  const [list, setList] = useState(initial);
  const reload = async () => setList((await api<{ providers: P[] }>("/admin/providers")).providers);
  return <div className="stack-lg">{list.map((p) => <Card key={p.id} p={p} reload={reload} />)}</div>;
}

function Card({ p, reload }: { p: P; reload: () => Promise<void> }) {
  const [model, setModel] = useState(p.model);
  const [key, setKey] = useState("");
  const [timeout, setTimeoutMs] = useState(p.timeoutMs);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [health, setHealth] = useState<{ ok: boolean; status: string; message: string; latencyMs?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const mock = p.id === "mock";

  async function patch(body: object, ok = "Saved.") {
    setBusy(true); setErr(""); setMsg("");
    try { await api(`/admin/providers/${p.id}`, { method: "PATCH", body }); setMsg(ok); setKey(""); await reload(); }
    catch (e) { setErr(e instanceof ApiError ? (e.fields[0]?.message ?? e.message) : "Could not save."); }
    setBusy(false);
  }
  async function check() {
    setBusy(true); setHealth(null);
    try { setHealth(await api(`/admin/providers/${p.id}/health`, { method: "POST", body: {} })); await reload(); } catch (e) { setErr(e instanceof ApiError ? e.message : "Check failed."); }
    setBusy(false);
  }
  return (
    <section className="card stack" aria-labelledby={`p-${p.id}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id={`p-${p.id}`} className="section-title">{p.displayName}</h2>
        <div className="row">
          {p.isDefault && <span className="badge badge-ok">Default</span>}{p.isFallback && <span className="badge badge-warn">Fallback</span>}
          <span className={`badge ${p.enabled ? "badge-ok" : ""}`}>{p.enabled ? "Enabled" : "Disabled"}</span>
          <span className={`badge ${p.hasKey ? "badge-ok" : "badge-warn"}`}>{mock ? "No key needed" : p.hasKey ? `Key set (${p.keySource})` : "No key"}</span>
        </div>
      </div>
      <p className="muted t-caption">Streaming: {p.capabilities.streaming ? "yes" : "no"} · Structured output: {p.capabilities.structuredOutput} · {p.capabilities.sendsDataExternally ? "Sends prompts to an external service" : "Runs on this server, nothing leaves"}</p>
      <p className="muted t-caption num">Last 7 days: {p.metrics.requests7d} requests, {p.metrics.failures7d} failures, {p.metrics.avgLatencyMs ?? "n/a"} ms average{p.metrics.lastError ? `, last error ${p.metrics.lastError.error_code}` : ""}</p>
      {!mock && (
        <div className="grid grid-2">
          <div className="field"><label htmlFor={`m-${p.id}`}>Model</label><input id={`m-${p.id}`} className="input" value={model} onChange={(e) => setModel(e.target.value)} /></div>
          <div className="field"><label htmlFor={`k-${p.id}`}>API key</label><input id={`k-${p.id}`} className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={p.hasKey ? "Leave blank to keep the current key" : "Paste key"} aria-describedby={`kh-${p.id}`} /><span id={`kh-${p.id}`} className="hint">Stored encrypted. Never displayed again.</span></div>
          <div className="field"><label htmlFor={`t-${p.id}`}>Timeout (ms)</label><input id={`t-${p.id}`} className="input" type="number" min={1000} max={120000} value={timeout} onChange={(e) => setTimeoutMs(Number(e.target.value))} /></div>
        </div>
      )}
      <div className="grid grid-2">
        <label className="check"><input type="checkbox" checked={p.enabled} disabled={busy || mock} onChange={(e) => patch({ enabled: e.target.checked })} /><span className="title">Enabled</span></label>
        {!mock && <label className="check"><input type="checkbox" checked={p.candidateDataOk} disabled={busy} onChange={(e) => patch({ candidateDataOk: e.target.checked }, "Data-handling approval updated.")} /><span><span className="title">Approved to receive candidate data</span><br /><span className="hint">Confirm your agreement with this provider permits it. Required before it can be used as a fallback.</span></span></label>}
        <label className="check"><input type="radio" name="default" checked={p.isDefault} disabled={busy || !p.enabled} onChange={() => patch({ isDefault: true }, "Default provider changed.")} /><span className="title">Default provider</span></label>
        {!mock && <label className="check"><input type="checkbox" checked={p.isFallback} disabled={busy || !p.enabled || p.isDefault} onChange={(e) => patch({ isFallback: e.target.checked }, "Fallback updated.")} /><span className="title">Use as fallback</span></label>}
      </div>
      <div className="row">
        {!mock && <button className="btn btn-sm" disabled={busy} onClick={() => patch({ model, timeoutMs: timeout, ...(key ? { apiKey: key } : {}) })}>Save settings</button>}
        {!mock && p.hasKey && p.keySource === "stored" && <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => patch({ apiKey: null }, "Stored key removed.")}>Remove stored key</button>}
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={check}>Check connection</button>
        <span role="status" className="t-caption muted">{msg}</span>
      </div>
      {err && <p className="notice notice-err" role="alert">{err}</p>}
      {health && <p className={`notice ${health.ok ? "notice-info" : "notice-warn"}`} role="status">{health.ok ? "Connected" : "Not connected"}: {health.message}{health.latencyMs !== undefined && ` (${health.latencyMs} ms)`}</p>}
    </section>
  );
}
