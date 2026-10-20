"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

/** Confirmation uses a real <dialog> so focus is trapped, Escape closes it and focus returns to the trigger. */
export function DeleteInterviewButton({ id, role, after }: { id: string; role: string; after?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function del() {
    setBusy(true);
    try {
      await api(`/interviews/${id}`, { method: "DELETE" });
      ref.current?.close();
      if (after) router.push(after);
      router.refresh();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not delete."); setBusy(false); }
  }
  return (
    <>
      <button className="linkbtn" style={{ color: "var(--danger)" }} onClick={() => ref.current?.showModal()}>Delete<span className="sr-only"> interview for {role}</span></button>
      <dialog ref={ref} aria-labelledby={`d-${id}`}>
        <h2 id={`d-${id}`} className="section-title">Delete this interview?</h2>
        <p className="muted" style={{ margin: "8px 0 16px" }}>The questions, answers, transcript, ratings, session events and consent records for “{role}” are permanently removed. This cannot be undone.</p>
        {err && <p className="field-error" role="alert">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => ref.current?.close()}>Cancel</button>
          <button className="btn btn-sm" style={{ background: "var(--danger)" }} disabled={busy} onClick={del}>{busy ? "Deleting…" : "Delete permanently"}</button>
        </div>
      </dialog>
    </>
  );
}
