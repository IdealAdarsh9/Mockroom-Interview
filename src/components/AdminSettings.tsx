"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";

type S = { retention: { resumeDays: number; transcriptDays: number; derivedDays: number }; monitoringDefaults: { visibility: boolean; focus: boolean; connection: boolean; clipboard: boolean; fullscreen: boolean }; humanReviewRequired: boolean };

export function AdminSettings({ initial }: { initial: S }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [sweep, setSweep] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    try { await api("/admin/settings", { method: "PUT", body: s }); setMsg("Saved."); } catch (x) { setErr(x instanceof ApiError ? (x.fields[0]?.message ?? x.message) : "Could not save."); }
  }
  async function runSweep() {
    if (!confirm("Delete everything older than the configured retention windows?")) return;
    try { const r = await api<Record<string, number>>("/admin/retention/sweep", { method: "POST", body: {} }); setSweep(`Removed ${r.resumesDeleted} résumés, ${r.transcriptSegmentsDeleted} transcript segments, ${r.interviewsDeleted} interviews.`); } catch (x) { setSweep(x instanceof ApiError ? x.message : "Sweep failed."); }
  }
  const num = (k: keyof S["retention"], label: string) => <div className="field"><label htmlFor={k}>{label}</label><input id={k} className="input" type="number" min={1} max={3650} value={s.retention[k]} onChange={(e) => setS({ ...s, retention: { ...s.retention, [k]: Number(e.target.value) } })} /></div>;
  const mon = (k: keyof S["monitoringDefaults"], label: string) => <label className="check"><input type="checkbox" checked={s.monitoringDefaults[k]} onChange={(e) => setS({ ...s, monitoringDefaults: { ...s.monitoringDefaults, [k]: e.target.checked } })} /><span className="title">{label}</span></label>;
  return (
    <div className="stack-lg">
      <form className="card stack" onSubmit={save}>
        <h2 className="section-title">Retention (days)</h2>
        <div className="grid grid-3">{num("resumeDays", "Résumés")}{num("transcriptDays", "Transcripts")}{num("derivedDays", "Reports and interviews")}</div>
        <h2 className="section-title" style={{ marginTop: 12 }}>Default monitoring policy for new interviews</h2>
        <p className="muted t-caption">Candidates still consent individually, and every event is neutral, disclosed and unscored.</p>
        <div className="grid grid-2">{mon("visibility", "Browser tab hidden")}{mon("focus", "Window lost focus")}{mon("connection", "Connection lost")}{mon("fullscreen", "Fullscreen exited")}{mon("clipboard", "Paste (length only)")}</div>
        <label className="check"><input type="checkbox" checked={s.humanReviewRequired} onChange={(e) => setS({ ...s, humanReviewRequired: e.target.checked })} /><span><span className="title">Require human review notice on reports</span><br /><span className="hint">Shown in the privacy policy and on shared reports.</span></span></label>
        <div className="row"><button className="btn">Save settings</button><span role="status" className="muted">{msg}</span></div>
        {err && <p className="notice notice-err" role="alert">{err}</p>}
      </form>
      <section className="card stack"><h2 className="section-title">Retention sweep</h2><p className="muted">Applies the windows above now. It also runs from <code>npm run retention:sweep</code> for scheduled use.</p><div className="row"><button className="btn btn-danger" onClick={runSweep}>Run sweep now</button><span role="status" className="muted">{sweep}</span></div></section>
    </div>
  );
}
