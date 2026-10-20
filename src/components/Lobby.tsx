"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { describeMediaError, startMeter } from "@/lib/media";

type S = { id: string; status: string; roleTitle: string; answerMode: string; providerId: string | null; providerExternal: boolean; demoMode: boolean; monitoring: { enabled: boolean; visibility: boolean; focus: boolean; connection: boolean; clipboard: boolean; fullscreen: boolean }; consents: Record<string, boolean>; organizationId: string | null; durationMin: number; hasResume: boolean; failureReason: string | null };

export function Lobby({ state }: { state: S }) {
  const router = useRouter();
  const [ai, setAi] = useState(state.consents.ai_processing);
  const [mic, setMic] = useState(state.consents.microphone);
  const [cam, setCam] = useState(state.consents.camera);
  const [diag, setDiag] = useState(state.consents.video_diagnostics);
  const [integrity, setIntegrity] = useState(state.consents.integrity_monitoring);
  const [share, setShare] = useState(state.consents.share_with_org);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [micMsg, setMicMsg] = useState("");
  const [camMsg, setCamMsg] = useState("");
  const [level, setLevel] = useState(0);
  const [micOk, setMicOk] = useState(false);
  const [camOk, setCamOk] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const streams = useRef<MediaStream[]>([]);
  const stopMeter = useRef<() => void>(() => {});
  useEffect(() => () => { streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop())); stopMeter.current(); }, []);

  async function testMic() {
    setMicMsg(""); setMicOk(false);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      streams.current.push(s); stopMeter.current(); stopMeter.current = startMeter(s, setLevel); setMicOk(true);
      setTimeout(() => { stopMeter.current(); s.getTracks().forEach((t) => t.stop()); setMicOk(false); }, 10000);
    } catch (e) { setMicMsg(describeMediaError(e, "microphone")); }
  }
  async function testCam() {
    setCamMsg(""); setCamOk(false);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      streams.current.push(s); setCamOk(true);
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}); } });
    } catch (e) { setCamMsg(describeMediaError(e, "camera")); }
  }

  async function start() {
    setBusy(true); setErr(null);
    try {
      await api(`/interviews/${state.id}/consent`, { body: { items: [
        { type: "ai_processing", granted: ai }, { type: "microphone", granted: mic }, { type: "camera", granted: cam },
        { type: "video_diagnostics", granted: cam && diag }, { type: "integrity_monitoring", granted: state.monitoring.enabled && integrity },
        ...(state.organizationId ? [{ type: "share_with_org", granted: share }] : []),
      ] } });
      streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop())); stopMeter.current();
      await api(`/interviews/${state.id}/start`, { method: "POST", body: {} });
      router.push(`/interviews/${state.id}/session`);
    } catch (x) { setErr(x instanceof ApiError ? x : new ApiError(0, "error", "Something went wrong.")); setBusy(false); }
  }

  const m = state.monitoring;
  const events = [m.visibility && "when the browser tab is hidden", m.focus && "when the window loses focus", m.connection && "when your connection drops", m.fullscreen && "when fullscreen is exited", m.clipboard && "when text is pasted (length only, never content)"].filter(Boolean) as string[];
  const resumeNow = state.status === "IN_PROGRESS" || state.status === "PAUSED";

  return (
    <div className="stack-lg">
      <div><h1 className="t-display">Before you begin</h1><p className="muted" style={{ marginTop: 6 }}>{state.roleTitle} · about {state.durationMin} minutes</p></div>
      {state.status === "CANCELLED" && <div className="notice notice-err">This interview was cancelled. <Link href="/interviews/new">Start a new one</Link>.</div>}
      {state.failureReason && <div className="notice notice-warn" role="alert">The last attempt hit a problem: {state.failureReason} Your consent choices are saved. You can try again.</div>}
      {resumeNow && <div className="notice notice-info">This interview is already underway. <Link href={`/interviews/${state.id}/session`}>Return to the room</Link>.</div>}

      <section className="card stack">
        <h2 className="section-title">How your answers are processed</h2>
        <p>{state.providerExternal ? <>Questions, your answers and short résumé excerpts are sent to the configured provider (<strong>{state.providerId}</strong>) to generate questions and feedback.</> : <>This deployment is in <strong>demo mode</strong>. Questions and ratings are produced by a built-in simulation on this server. Nothing is sent to an outside AI service.</>} Ratings are AI-assisted estimates from the words of your answers, they can be wrong, and a person should review them before any decision.</p>
        <label className="check"><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /><span><span className="title">I understand and agree (required)</span><br /><span className="hint">Needed to run the interview. <Link href="/privacy">Read the privacy and consent terms</Link>.</span></span></label>
      </section>

      <section className="card stack">
        <h2 className="section-title">Microphone and camera (optional)</h2>
        <p className="muted">Everything works with text only. Skip these and you will not be marked down.</p>
        <label className="check"><input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} /><span><span className="title">Use my microphone for spoken answers</span><br /><span className="hint">Live captions come from your browser&apos;s speech recognition, which may send audio to your browser vendor. Optional clips sent for server transcription are processed in memory and not stored.</span></span></label>
        <label className="check"><input type="checkbox" checked={cam} onChange={(e) => { setCam(e.target.checked); if (!e.target.checked) setDiag(false); }} /><span><span className="title">Show my camera preview</span><br /><span className="hint">Video stays in your browser. It is never recorded or uploaded.</span></span></label>
        {cam && <label className="check" style={{ marginLeft: 24 }}><input type="checkbox" checked={diag} onChange={(e) => setDiag(e.target.checked)} /><span><span className="title">Run camera checks</span><br /><span className="hint">Detects a dark or frozen picture, or no face in frame, locally. It never reads expressions, gaze, identity or emotion. Only a neutral event note is saved.</span></span></label>}
        <div className="grid grid-2" style={{ marginTop: 8 }}>
          <div className="stack">
            <button type="button" className="btn btn-ghost btn-sm" onClick={testMic}>Test microphone</button>
            {micMsg && <p className="notice notice-warn" role="alert">{micMsg}</p>}
            {micOk && <div><div className="meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}><div style={{ width: `${level * 100}%` }} /></div><p className="hint" style={{ marginTop: 4 }}>Say something. The bar should move.</p></div>}
          </div>
          <div className="stack">
            <button type="button" className="btn btn-ghost btn-sm" onClick={testCam}>Test camera</button>
            {camMsg && <p className="notice notice-warn" role="alert">{camMsg}</p>}
            {camOk && <div className="video" style={{ maxWidth: 280 }}><video ref={video} muted playsInline aria-label="Camera preview" /></div>}
          </div>
        </div>
      </section>

      <section className="card stack">
        <h2 className="section-title">Session monitoring</h2>
        {m.enabled && events.length ? (
          <>
            <p>This interview&apos;s policy records a neutral note {events.join(", ")}. Each note has a time and duration. Notes are labelled unverified signals with many ordinary causes, you can see and contest every one, and they never change your score or rank you. No other browsing, files or screen content are inspected. If outside help is not allowed for this practice, that is your choice to honour. Nothing here proves otherwise.</p>
            <label className="check"><input type="checkbox" checked={integrity} onChange={(e) => setIntegrity(e.target.checked)} /><span><span className="title">Allow these notes to be recorded</span><br /><span className="hint">Optional. Decline and the interview proceeds normally.</span></span></label>
          </>
        ) : <p className="muted">Monitoring is switched off for this interview. Nothing is recorded.</p>}
      </section>

      {state.organizationId && (
        <section className="card stack"><h2 className="section-title">Sharing</h2>
          <label className="check"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /><span><span className="title">Share my finished report with the chosen organization</span><br /><span className="hint">Optional. You can withdraw from the results page at any time.</span></span></label></section>
      )}

      {err && <div className="notice notice-err" role="alert">{err.code === "consent_required" ? "Tick the first box to confirm how your answers are processed." : err.message}{err.status === 502 && " This was a provider problem and your setup is saved. Try again."}</div>}
      <div className="row">
        <button className="btn" onClick={start} disabled={busy || !ai || state.status === "CANCELLED"}>{busy ? "Preparing your first question…" : resumeNow ? "Rejoin interview" : "Start interview"}</button>
        <Link href="/interviews">Not now</Link>
      </div>
    </div>
  );
}
