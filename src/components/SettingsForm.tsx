"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

type P = { headline: string; targetRole: string; experienceLevel: string; accommodationsNote: string; prefersTextMode: boolean };

export function SettingsForm({ profile, retention }: { profile: P; retention: { resumeDays: number; transcriptDays: number; derivedDays: number } }) {
  const router = useRouter();
  const [p, setP] = useState(profile);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const dlg = useRef<HTMLDialogElement>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(""); setMsg("");
    try { await api("/profile", { method: "PATCH", body: { headline: p.headline, targetRole: p.targetRole, experienceLevel: p.experienceLevel || null, accommodationsNote: p.accommodationsNote, prefersTextMode: p.prefersTextMode } }); setMsg("Saved."); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Could not save."); }
    setBusy(false);
  }
  async function del() {
    setErr("");
    try { await api("/privacy/account", { method: "DELETE", body: { confirm } }); router.push("/"); router.refresh(); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Could not delete."); }
  }
  return (
    <div className="stack-lg">
      <form className="card stack" onSubmit={save}>
        <h2 className="section-title">Profile and accessibility</h2>
        <div className="field"><label htmlFor="h">Headline</label><input id="h" className="input" value={p.headline} maxLength={120} onChange={(e) => setP({ ...p, headline: e.target.value })} /></div>
        <div className="field"><label htmlFor="tr">Target role</label><input id="tr" className="input" value={p.targetRole} maxLength={120} onChange={(e) => setP({ ...p, targetRole: e.target.value })} /></div>
        <div className="field"><label htmlFor="xl">Experience level</label><select id="xl" className="select" value={p.experienceLevel} onChange={(e) => setP({ ...p, experienceLevel: e.target.value })}><option value="">Not set</option><option value="entry">Entry</option><option value="mid">Mid</option><option value="senior">Senior</option><option value="lead">Lead</option></select></div>
        <label className="check"><input type="checkbox" checked={p.prefersTextMode} onChange={(e) => setP({ ...p, prefersTextMode: e.target.checked })} /><span><span className="title">Default to text-only interviews</span><br /><span className="hint">New interviews start in text mode. You can still switch at any time.</span></span></label>
        <div className="field"><label htmlFor="ac">Accommodations note (optional)</label><textarea id="ac" className="textarea" style={{ minHeight: 80 }} value={p.accommodationsNote} maxLength={500} onChange={(e) => setP({ ...p, accommodationsNote: e.target.value })} aria-describedby="ac-h" /><span id="ac-h" className="hint">For your own reference and any reviewer. It is never used in scoring.</span></div>
        <div className="row"><button className="btn" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button><span role="status" className="muted">{msg}</span></div>
      </form>

      <section className="card stack">
        <h2 className="section-title">Your data</h2>
        <p className="muted">Résumés are kept {retention.resumeDays} days, transcripts {retention.transcriptDays} days and reports {retention.derivedDays} days, then deleted automatically. You can delete sooner.</p>
        <div className="row"><a className="btn btn-ghost" href="/api/v1/privacy/export" download>Export everything (JSON)</a></div>
      </section>

      <section className="card stack">
        <h2 className="section-title">Delete account</h2>
        <p className="muted">Permanently removes your account, résumé files and indexed passages, interviews, transcripts, ratings, session events and consent records.</p>
        <div><button className="btn btn-danger" onClick={() => dlg.current?.showModal()}>Delete my account…</button></div>
        <dialog ref={dlg} aria-labelledby="del-h">
          <h2 id="del-h" className="section-title">Delete your account?</h2>
          <p className="muted" style={{ margin: "8px 0 12px" }}>This cannot be undone. Type DELETE to confirm.</p>
          <div className="field"><label htmlFor="cf">Confirmation</label><input id="cf" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></div>
          {err && <p className="field-error" role="alert">{err}</p>}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}><button className="btn btn-ghost btn-sm" onClick={() => dlg.current?.close()}>Cancel</button><button className="btn btn-sm" style={{ background: "var(--danger)" }} disabled={confirm !== "DELETE"} onClick={del}>Delete everything</button></div>
        </dialog>
      </section>
      {err && !dlg.current?.open && <div className="notice notice-err" role="alert">{err}</div>}
    </div>
  );
}
