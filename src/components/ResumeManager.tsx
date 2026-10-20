"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";

type Resume = { id: string; name: string; sizeBytes: number; status: string; progress: number; error: { code: string; message: string } | null; charCount: number; sections: { name: string; heading: string | null; chars: number }[]; chunkCount: number; createdAt: string };
type Preview = Resume & { previewText: string; truncated: boolean; chunks: { id: string; section: string; tokens: number; flagged: boolean }[] };
type Hit = { chunkId: string; section: string; text: string; score: number };

const STEPS: Record<string, string> = { UPLOADED: "Uploaded", PARSING: "Reading text", CHUNKING: "Detecting sections", EMBEDDING: "Indexing", READY: "Ready", FAILED: "Could not process" };

export function ResumeManager() {
  const [items, setItems] = useState<Resume[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [upPct, setUpPct] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const replaceId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ resumes: Resume[] }>("/resumes");
      setItems(r.resumes);
      return r.resumes;
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not load résumés."); return null; }
  }, []);
  useEffect(() => { void load().then((r) => r && r[0] && setSelected((s) => s ?? r[0].id)); }, [load]);

  // Poll while any résumé is still being processed.
  useEffect(() => {
    if (!items?.some((i) => !["READY", "FAILED"].includes(i.status))) return;
    const t = setInterval(() => void load(), 900);
    return () => clearInterval(t);
  }, [items, load]);

  useEffect(() => {
    if (!selected) { setPreview(null); return; }
    const row = items?.find((i) => i.id === selected);
    if (!row || !["READY", "FAILED"].includes(row.status)) return;
    api<Preview>(`/resumes/${selected}`).then(setPreview).catch(() => setPreview(null));
  }, [selected, items]);

  function upload(file: File) {
    setError(""); setMsg("");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "docx", "txt"].includes(ext)) { setError("Choose a PDF, DOCX or TXT file."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("That file is larger than 5 MB."); return; }
    const fd = new FormData();
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/resumes" + (replaceId.current ? `?replaceId=${replaceId.current}` : ""));
    xhr.upload.onprogress = (e) => e.lengthComputable && setUpPct(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => { setUpPct(null); setError("Upload failed. Check your connection and try again."); };
    xhr.onload = async () => {
      setUpPct(null);
      const body = (() => { try { return JSON.parse(xhr.responseText); } catch { return null; } })();
      if (xhr.status >= 400) { setError(body?.error?.message ?? "Upload failed."); return; }
      replaceId.current = null;
      const r = await load();
      setSelected(body.id);
      setMsg("Uploaded. Processing now.");
      void r;
    };
    xhr.send(fd);
  }

  async function remove(id: string) {
    if (!confirm("Delete this résumé and its indexed passages? Interviews already completed keep their reports, but evidence excerpts will show as removed.")) return;
    try { await api(`/resumes/${id}`, { method: "DELETE" }); setMsg("Résumé and indexed passages deleted."); setSelected(null); setPreview(null); setHits(null); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Delete failed."); }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try { const r = await api<{ results: Hit[] }>(`/resumes/${selected}/search`, { body: { query, k: 4 } }); setHits(r.results); setError(""); }
    catch (x) { setError(x instanceof ApiError ? x.message : "Search failed."); }
  }

  const cur = items?.find((i) => i.id === selected);
  return (
    <div className="stack-lg">
      {error && <div className="notice notice-err" role="alert">{error}</div>}
      {msg && <div className="notice notice-info" role="status">{msg}</div>}
      <div
        className="card"
        style={{ outline: drag ? "2px dashed var(--primary)" : "none", outlineOffset: -8, textAlign: "center", padding: 40 }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
      >
        <h2 className="section-title">{items && items.length ? "Replace your résumé" : "Upload your résumé"}</h2>
        <p className="muted" style={{ margin: "6px 0 16px" }}>Drag a file here, or choose one. A replacement is only swapped in after it processes successfully.</p>
        <input ref={input} id="resume-file" type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; replaceId.current = items?.find((i) => i.status === "READY")?.id ?? null; if (f) upload(f); e.target.value = ""; }} />
        <label htmlFor="resume-file" className="btn" style={{ cursor: "pointer" }} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}>Choose file</label>
        {upPct !== null && (
          <div style={{ maxWidth: 360, margin: "20px auto 0" }} role="status" aria-live="polite">
            <div className="progress" role="progressbar" aria-valuenow={upPct} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress"><div style={{ width: `${upPct}%` }} /></div>
            <p className="t-caption muted" style={{ marginTop: 6 }}>Uploading {upPct}%</p>
          </div>
        )}
      </div>

      {items === null ? <div className="skeleton" style={{ height: 120 }} aria-busy="true" aria-label="Loading résumés" /> : items.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: "minmax(0,320px) minmax(0,1fr)" }}>
          <div className="card stack" style={{ alignSelf: "start" }}>
            <h2 className="section-title">Your files</h2>
            {items.map((r) => (
              <button key={r.id} onClick={() => setSelected(r.id)} aria-current={selected === r.id} className="check" style={{ textAlign: "left", border: selected === r.id ? "2px solid var(--primary-focus)" : "2px solid transparent", font: "inherit", width: "100%", display: "block" }}>
                <span className="title">{r.name}</span><br />
                <span className={`badge ${r.status === "READY" ? "badge-ok" : r.status === "FAILED" ? "badge-err" : "badge-warn"}`}>{STEPS[r.status]}</span>
                {!["READY", "FAILED"].includes(r.status) && <div className="progress" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={r.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Processing ${r.name}`}><div style={{ width: `${r.progress}%` }} /></div>}
              </button>
            ))}
          </div>
          <div className="stack" aria-live="polite">
            {cur?.status === "FAILED" && (
              <div className="card stack"><h2 className="section-title">This file could not be processed</h2>
                <p className="notice notice-err">{cur.error?.message}</p>
                <div className="row"><button className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>Try another file</button><button className="btn btn-danger btn-sm" onClick={() => remove(cur.id)}>Delete</button></div></div>
            )}
            {cur && !["READY", "FAILED"].includes(cur.status) && <div className="card"><p><strong>{STEPS[cur.status]}…</strong></p><div className="progress" style={{ marginTop: 10 }}><div style={{ width: `${cur.progress}%` }} /></div></div>}
            {preview && preview.status === "READY" && (
              <>
                <div className="card stack">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <h2 className="section-title">Detected sections</h2>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(preview.id)}>Delete résumé</button>
                  </div>
                  <div className="row">{preview.sections.map((s, i) => <span key={i} className="badge">{s.name} · {s.chars} chars</span>)}</div>
                  <p className="muted t-caption">{preview.chunkCount} indexed passages. Parsed text is shown as extracted; nothing was added or inferred.</p>
                  {preview.chunks.some((c) => c.flagged) && <p className="notice notice-warn">Some passages look like instructions aimed at an AI. They are excluded from interview prompts.</p>}
                </div>
                <div className="card stack">
                  <h2 className="section-title">Extracted text</h2>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 15, margin: 0, maxHeight: 320, overflow: "auto", background: "var(--parchment)", padding: 16, borderRadius: 11 }} tabIndex={0} aria-label="Extracted résumé text">{preview.previewText}</pre>
                  {preview.truncated && <p className="muted t-caption">Preview truncated.</p>}
                </div>
                <form className="card stack" onSubmit={search}>
                  <h2 className="section-title">Test retrieval</h2>
                  <p className="muted t-caption">See which passages the interviewer would find for a topic. Only your own résumé is searched.</p>
                  <div className="row"><div className="field" style={{ flex: 1, minWidth: 220 }}><label htmlFor="rq" className="sr-only">Search topic</label><input id="rq" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="For example: performance, mentoring" minLength={2} required /></div><button className="btn btn-sm" type="submit">Search</button></div>
                  {hits && (hits.length === 0 ? <p className="muted">No matching passages.</p> : <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">{hits.map((h) => <li key={h.chunkId}><span className="badge">{h.section}</span> <span className="muted t-caption num">relevance {h.score.toFixed(2)}</span><p style={{ marginTop: 4 }}>{h.text.slice(0, 240)}</p></li>)}</ul>)}
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
