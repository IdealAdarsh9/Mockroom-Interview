"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export function ResultsActions({ id, share, canShare }: { id: string; share: boolean; canShare: boolean }) {
  const router = useRouter();
  const [shared, setShared] = useState(share);
  const [msg, setMsg] = useState("");
  async function toggle() {
    try { const r = await api<{ shareWithOrg: boolean }>(`/interviews/${id}/share`, { body: { share: !shared } }); setShared(r.shareWithOrg); setMsg(r.shareWithOrg ? "Shared with the organization." : "Sharing withdrawn."); router.refresh(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not update sharing."); }
  }
  return (
    <div className="row">
      <a className="btn btn-ghost btn-sm" href={`/api/v1/interviews/${id}/report/export?format=md`} download>Download report (Markdown)</a>
      <a className="btn btn-ghost btn-sm" href={`/api/v1/interviews/${id}/report/export?format=json`} download>Download (JSON)</a>
      {canShare && <button className="btn btn-sm" aria-pressed={shared} onClick={toggle}>{shared ? "Stop sharing with organization" : "Share with organization"}</button>}
      <span role="status" className="t-caption muted">{msg}</span>
    </div>
  );
}

export function ContestButton({ interviewId, eventId, disabled }: { interviewId: string; eventId: string; disabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  if (disabled) return null;
  async function save() {
    try { await api(`/interviews/${interviewId}/events/${eventId}/contest`, { body: { note } }); setOpen(false); router.refresh(); }
    catch (e) { setErr(e instanceof ApiError ? (e.fields[0]?.message ?? e.message) : "Could not save."); }
  }
  return open ? (
    <div className="stack" style={{ marginTop: 8 }}>
      <label className="label" htmlFor={`c-${eventId}`}>What is inaccurate or missing?</label>
      <textarea id={`c-${eventId}`} className="textarea" style={{ minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-describedby={err ? `c-${eventId}-e` : undefined} />
      {err && <span id={`c-${eventId}-e`} className="field-error" role="alert">{err}</span>}
      <div className="row"><button className="btn btn-sm" onClick={save}>Submit note</button><button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  ) : <button className="linkbtn t-caption" onClick={() => setOpen(true)}>Contest this record</button>;
}
