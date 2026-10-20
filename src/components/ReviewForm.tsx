"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export function ReviewForm({ interviewId, evaluationId, current }: { interviewId: string; evaluationId: string; current: { humanScore: number | null; humanNote: string | null } }) {
  const router = useRouter();
  const [score, setScore] = useState(current.humanScore === null ? "" : String(current.humanScore));
  const [note, setNote] = useState(current.humanNote ?? "");
  const [msg, setMsg] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await api(`/recruiter/reports/${interviewId}/review/${evaluationId}`, { body: { score: score === "" ? null : Number(score), note } }); setMsg("Review saved."); router.refresh(); }
    catch (x) { setMsg(x instanceof ApiError ? x.message : "Could not save."); }
  }
  return (
    <form onSubmit={save} className="row" style={{ alignItems: "flex-end" }}>
      <div className="field" style={{ width: 120 }}><label htmlFor={`s-${evaluationId}`}>Your rating</label><select id={`s-${evaluationId}`} className="select" value={score} onChange={(e) => setScore(e.target.value)}><option value="">Keep AI rating</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></div>
      <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor={`n-${evaluationId}`}>Reviewer note</label><input id={`n-${evaluationId}`} className="input" value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} /></div>
      <button className="btn btn-sm" type="submit">Save review</button><span role="status" className="t-caption muted">{msg}</span>
    </form>
  );
}
