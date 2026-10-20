"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, mmss } from "@/lib/api";
import { CameraDiagnostics, describeMediaError, SIGNAL_TIPS, startMeter, type CameraSignal } from "@/lib/media";

type Q = { id: string; ordinal: number; kind: string; text: string; competencyName: string; needsClarification: boolean; resumeSections: string[] };
type St = {
  id: string; status: string; roleTitle: string; answerMode: string; demoMode: boolean; providerId: string | null; providerExternal: boolean; failureReason: string | null;
  maxQuestions: number; primaryAsked: number; primaryAnswered: number; current: Q | null; history: (Q & { answer: string; skipped: boolean })[]; elapsedMs: number; durationMin: number;
  monitoring: { enabled: boolean; visibility: boolean; focus: boolean; connection: boolean; clipboard: boolean; fullscreen: boolean }; consents: Record<string, boolean>;
};
type Seg = { id: string; speaker: string; text: string; originalText?: string; corrected: boolean; atMs: number };
type Recog = { start(): void; stop(): void; abort(): void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };

const SR = () => (typeof window === "undefined" ? undefined : ((window as unknown as { SpeechRecognition?: new () => Recog; webkitSpeechRecognition?: new () => Recog }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recog }).webkitSpeechRecognition));

export function Room({ id }: { id: string }) {
  const router = useRouter();
  const [st, setSt] = useState<St | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [text, setText] = useState("");
  const [recognized, setRecognized] = useState("");
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [online, setOnline] = useState(true);
  const [latency, setLatency] = useState<number | null>(null);
  const [stream, setStream] = useState<"live" | "reconnecting">("reconnecting");
  const [segs, setSegs] = useState<Seg[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [clarify, setClarify] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // voice out
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [audioNote, setAudioNote] = useState("");
  // devices
  const [micOn, setMicOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [micErr, setMicErr] = useState("");
  const [dictating, setDictating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState("");
  const [signals, setSignals] = useState<CameraSignal[]>([]);

  const stRef = useRef<St | null>(null); stRef.current = st;
  const spokenFor = useRef<string | null>(null);
  const answerStart = useRef<number>(Date.now());
  const micStream = useRef<MediaStream | null>(null);
  const stopMeter = useRef<() => void>(() => {});
  const camStream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const diag = useRef<CameraDiagnostics | null>(null);
  const recog = useRef<Recog | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const localT0 = useRef<number>(Date.now());
  const ta = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const t0 = performance.now();
    try {
      const s = await api<St>(`/interviews/${id}`);
      setLatency(Math.round(performance.now() - t0));
      localT0.current = Date.now();
      setSt(s); setLoadErr("");
      if (s.status === "COMPLETED") router.replace(`/interviews/${id}/results`);
      if (s.status === "CREATED") router.replace(`/interviews/${id}/lobby`);
      return s;
    } catch (e) { setLoadErr(e instanceof ApiError ? e.message : "Could not load the interview."); return null; }
  }, [id, router]);
  const loadSegs = useCallback(async () => { try { setSegs((await api<{ segments: Seg[] }>(`/interviews/${id}/transcript`)).segments); } catch { /* shown next refresh */ } }, [id]);
  useEffect(() => { void load(); void loadSegs(); }, [load, loadSegs]);

  // restore an unsent draft after a reload or network drop
  const qid = st?.current?.id;
  useEffect(() => {
    if (!qid) return;
    answerStart.current = Date.now();
    try { const d = sessionStorage.getItem(`draft:${id}:${qid}`); setText(d ?? ""); } catch { setText(""); }
    setRecognized(""); setInterim(""); setClarify(false); setErr(null);
  }, [qid, id]);
  useEffect(() => { if (qid) try { if (text) sessionStorage.setItem(`draft:${id}:${qid}`, text); else sessionStorage.removeItem(`draft:${id}:${qid}`); } catch { /* storage unavailable */ } }, [text, qid, id]);

  // liveness stream (SSE). EventSource reconnects on its own; we only reflect its state and react to status changes.
  useEffect(() => {
    const es = new EventSource(`/api/v1/interviews/${id}/stream`);
    es.onopen = () => setStream("live");
    es.onerror = () => setStream("reconnecting");
    es.addEventListener("status", (e) => { const d = JSON.parse((e as MessageEvent).data); if (stRef.current && (d.status !== stRef.current.status || d.questionId !== (stRef.current.current?.id ?? null))) void load(); });
    return () => es.close();
  }, [id, load]);

  // timer tick
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const elapsed = st ? st.elapsedMs + (st.status === "IN_PROGRESS" ? Date.now() - localT0.current : 0) : 0;

  // ---------- integrity events (only when the candidate consented and the policy allows) ----------
  const monitoring = !!(st?.consents.integrity_monitoring && st.monitoring.enabled);
  const send = useCallback((type: string, durationMs?: number, metadata?: { chars: number }) => {
    void api(`/interviews/${id}/events`, { body: { type, occurredAt: new Date(Date.now() - (durationMs ?? 0)).toISOString(), durationMs, metadata } }).catch(() => {});
  }, [id]);
  useEffect(() => {
    if (!monitoring || st?.status !== "IN_PROGRESS") return;
    let hiddenAt = 0, blurAt = 0, offAt = 0;
    const vis = () => { if (document.hidden) hiddenAt = Date.now(); else if (hiddenAt) { send("tab_hidden", Date.now() - hiddenAt); hiddenAt = 0; } };
    const blur = () => { blurAt = Date.now(); };
    const focus = () => { if (blurAt && !document.hidden) { const d = Date.now() - blurAt; if (d > 1500) send("window_blur", d); } blurAt = 0; };
    const off = () => { offAt = Date.now(); };
    const on = () => { if (offAt) { send("connection_lost", Date.now() - offAt); offAt = 0; } };
    const fs = () => { if (!document.fullscreenElement) send("fullscreen_exit"); };
    document.addEventListener("visibilitychange", vis); window.addEventListener("blur", blur); window.addEventListener("focus", focus);
    window.addEventListener("offline", off); window.addEventListener("online", on); document.addEventListener("fullscreenchange", fs);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("blur", blur); window.removeEventListener("focus", focus); window.removeEventListener("offline", off); window.removeEventListener("online", on); document.removeEventListener("fullscreenchange", fs); };
  }, [monitoring, st?.status, send]);

  // connection indicator + retry of a saved draft when the network returns
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); void load(); }; const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [load]);

  // ---------- AI voice (on-device speech synthesis) ----------
  const speak = useCallback((t: string) => {
    setAudioNote("");
    if (typeof speechSynthesis === "undefined") { setAudioNote("Audio playback is not available in this browser. Read the question on screen."); return; }
    speechSynthesis.cancel(); // prevents duplicate or overlapping speech on retries
    const u = new SpeechSynthesisUtterance(t);
    u.rate = rate; u.volume = volume;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = (e) => { setSpeaking(false); if (e.error !== "canceled" && e.error !== "interrupted") setAudioNote("The browser blocked or could not play audio. Use Repeat question, or read the question on screen."); };
    speechSynthesis.speak(u);
  }, [rate, volume]);
  useEffect(() => {
    if (!st?.current || st.status !== "IN_PROGRESS" || !voiceOn || spokenFor.current === st.current.id) return;
    spokenFor.current = st.current.id;
    speak(st.current.text);
    heading.current?.focus({ preventScroll: true });
  }, [st?.current, st?.status, voiceOn, speak]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }, []);

  // ---------- microphone ----------
  async function enableMic() {
    setMicErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.current = s; stopMeter.current = startMeter(s, setLevel); setMicOn(true); setMuted(false);
    } catch (e) { setMicErr(describeMediaError(e, "microphone")); }
  }
  function disableMic() { stopDictation(); stopMeter.current(); micStream.current?.getTracks().forEach((t) => t.stop()); micStream.current = null; setMicOn(false); }
  function toggleMute() { const m = !muted; setMuted(m); micStream.current?.getAudioTracks().forEach((t) => (t.enabled = !m)); if (m) stopDictation(); }
  const dictationSupported = typeof window !== "undefined" && !!SR();
  function startDictation() {
    const R = SR(); if (!R) return;
    setMicErr(""); speechSynthesis?.cancel?.();
    const r = new R(); r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      let fin = "", part = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) fin += res[0].transcript; else part += res[0].transcript; }
      if (fin) { setRecognized((p) => (p ? p + " " : "") + fin.trim()); setText((p) => (p ? p + " " : "") + fin.trim()); }
      setInterim(part);
    };
    r.onerror = (e) => { setDictating(false); setInterim(""); setMicErr(e.error === "no-speech" ? "No speech was heard. Check your microphone level, or type instead." : e.error === "not-allowed" ? "Speech recognition was blocked. Type your answer instead." : e.error === "network" ? "Speech recognition lost its connection. Type your answer or try again." : "Live dictation stopped. You can keep typing."); };
    r.onend = () => { setDictating(false); setInterim(""); };
    recog.current = r; r.start(); setDictating(true);
  }
  function stopDictation() { recog.current?.stop(); recog.current = null; setDictating(false); }

  async function toggleRecord() {
    if (recording) { recorder.current?.stop(); return; }
    if (!micStream.current) return;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(micStream.current);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      setRecording(false);
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      try {
        const res = await fetch(`/api/v1/speech/transcribe?interviewId=${id}`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
        const d = await res.json();
        if (!res.ok) throw new ApiError(res.status, d?.error?.code ?? "error", d?.error?.message ?? "Transcription failed.");
        if (d.text) { setRecognized((p) => (p ? p + " " : "") + d.text); setText((p) => (p ? p + " " : "") + d.text); }
        setMicErr(d.mock ? "This clip was transcribed by the demo speech adapter, so the words are placeholders. Edit them." : "");
      } catch (e) { setMicErr(e instanceof ApiError ? e.message : "Transcription failed. You can type your answer."); }
    };
    recorder.current = rec; rec.start(); setRecording(true);
  }

  // ---------- camera ----------
  async function enableCam() {
    setCamErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      camStream.current = s; setCamOn(true);
      requestAnimationFrame(() => {
        const v = video.current; if (!v) return;
        v.srcObject = s; void v.play().catch(() => {});
        if (stRef.current?.consents.video_diagnostics) {
          diag.current?.stop();
          diag.current = new CameraDiagnostics(v, setSignals, (sig, ms) => {
            const map: Record<CameraSignal, string> = { dark: "low_light", frozen: "camera_frozen", no_face: "framing_issue", lost: "camera_unavailable" };
            send(map[sig], ms);
          });
          diag.current.start();
        }
      });
    } catch (e) { setCamErr(describeMediaError(e, "camera")); }
  }
  function disableCam() { diag.current?.stop(); diag.current = null; camStream.current?.getTracks().forEach((t) => t.stop()); camStream.current = null; setCamOn(false); setSignals([]); }
  useEffect(() => () => { disableMic(); disableCam(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- actions ----------
  async function act(path: string) {
    setBusy(true); setErr(null);
    try {
      const s = await api<St>(`/interviews/${id}/${path}`, { method: "POST", body: {} });
      if (path === "complete") { router.push(`/interviews/${id}/results`); return; }
      setSt(s); localT0.current = Date.now();
    }
    catch (e) { setErr(e instanceof ApiError ? e : null); if (path === "complete") await load(); }
    setBusy(false);
  }
  async function submit(skipped = false) {
    if (!st?.current) return;
    stopDictation();
    setBusy(true); setErr(null);
    const source = recognized ? "speech" : "text";
    try {
      const r = await api<St & { done?: boolean }>(`/interviews/${id}/answer`, { body: { questionId: st.current.id, text: skipped ? "" : text, originalText: recognized || undefined, source, durationMs: Date.now() - answerStart.current, skipped } });
      try { sessionStorage.removeItem(`draft:${id}:${st.current.id}`); } catch { /* ok */ }
      if (r.done || r.status === "COMPLETED") { router.push(`/interviews/${id}/results`); return; }
      setSt(r); localT0.current = Date.now(); void loadSegs();
    } catch (e) {
      const ae = e instanceof ApiError ? e : null;
      setErr(ae);
      if (ae?.status === 502) await load(); // answer was saved server-side; refresh to see whether a next question exists
    }
    setBusy(false);
  }
  async function saveEdit(segId: string) {
    try { await api(`/interviews/${id}/transcript/${segId}`, { method: "PATCH", body: { text: editText } }); setEditing(null); await loadSegs(); await load(); }
    catch (e) { setErr(e instanceof ApiError ? e : null); }
  }

  const conn = useMemo(() => (!online ? { label: "Offline", cls: "badge-err" } : stream === "reconnecting" ? { label: "Reconnecting", cls: "badge-warn" } : latency && latency > 1500 ? { label: "Slow connection", cls: "badge-warn" } : { label: "Connected", cls: "badge-ok" }), [online, stream, latency]);

  if (loadErr && !st) return <div className="notice notice-err" role="alert">{loadErr} <button className="linkbtn" onClick={() => void load()}>Try again</button></div>;
  if (!st) return <div className="stack" aria-busy="true" aria-label="Loading interview"><div className="skeleton" style={{ height: 220 }} /><div className="skeleton" style={{ height: 160 }} /></div>;
  if (st.status === "CANCELLED") return <div className="card"><h1 className="t-display">Interview cancelled</h1><p className="muted" style={{ margin: "8px 0 16px" }}>This interview was cancelled.</p><Link className="btn" href="/interviews/new">Start a new interview</Link></div>;

  const paused = st.status === "PAUSED";
  const failed = st.status === "FAILED" || (!st.current && st.status === "IN_PROGRESS");
  const q = st.current;
  const clarifyText = q ? `This question looks at ${q.competencyName.toLowerCase()}. ${q.resumeSections.length ? `It was based on your ${q.resumeSections.join(" and ")} section. ` : "It is not tied to a specific résumé line. "}Answer from any relevant experience in your own words, and say so if you have none.` : "";

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1 className="t-section" style={{ fontSize: 24 }}>{st.roleTitle}</h1><p className="muted t-caption">Question {Math.min(st.primaryAsked, st.maxQuestions)} of about {st.maxQuestions} · <span className="num" aria-label="Elapsed time">{mmss(elapsed)}</span> of {st.durationMin} min</p></div>
        <div className="row" role="status" aria-live="polite">
          <span className={`badge ${conn.cls}`}>{conn.label}</span>
          {st.demoMode && <span className="badge badge-demo">Demo mode</span>}
          {st.providerExternal && <span className="badge">AI: {st.providerId}</span>}
          {paused && <span className="badge badge-warn">Paused</span>}
        </div>
      </div>
      {!online && <div className="notice notice-warn" role="alert">You are offline. Your answer is kept on this device and you can submit once the connection returns. Nothing is lost.</div>}
      {monitoring && <div className="notice notice-info">Session monitoring is on, as you agreed: {[st.monitoring.visibility && "tab hidden", st.monitoring.focus && "window focus", st.monitoring.connection && "connection", st.monitoring.fullscreen && "fullscreen", st.monitoring.clipboard && "paste length"].filter(Boolean).join(", ")}. Notes are unverified, visible to you, and never scored.</div>}
      {err && err.status !== 502 && <div className="notice notice-err" role="alert">{err.message}</div>}
      {err?.status === 502 && <div className="notice notice-warn" role="alert">{err.message} Your answer is saved. <button className="linkbtn" onClick={() => void act("next")}>Try loading the next question</button></div>}

      <div className="room">
        <div className="stack">
          <section className="stage" aria-labelledby="q-h">
            {failed ? (
              <div className="stack"><h2 id="q-h" className="t-tagline">We hit a snag preparing the next question</h2><p className="muted">{st.failureReason ?? "The AI service did not respond."} Nothing you answered was lost.</p>
                <div className="row"><button className="btn" disabled={busy} onClick={() => void act(st.status === "FAILED" ? "start" : "next")}>Try again</button><button className="btn btn-ghost" onClick={() => setConfirmEnd(true)}>End and see results</button></div></div>
            ) : q ? (
              <>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="t-caption muted">{q.kind === "follow_up" ? "Follow-up" : q.competencyName}</span>
                  <span aria-live="polite">{speaking ? <span className="speaking-dots" role="img" aria-label="Interviewer is speaking"><i /><i /><i /></span> : <span className="t-caption muted">{voiceOn ? "Interviewer is listening" : "Voice off"}</span>}</span>
                </div>
                <h2 id="q-h" className="q-text" tabIndex={-1} ref={heading} aria-live="polite">{q.text}</h2>
                {q.resumeSections.length > 0 && <p className="t-caption muted">Based on your résumé: {q.resumeSections.join(", ")}</p>}
                {q.needsClarification && <p className="t-caption" style={{ color: "var(--primary-on-dark)" }}>Your résumé does not mention this, so you are being asked rather than assumed.</p>}
                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => speak(q.text)} disabled={paused}>Repeat question</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setClarify((c) => !c)} aria-expanded={clarify}>Request clarification</button>
                  <button className="btn btn-ghost btn-sm" aria-pressed={voiceOn} onClick={() => { setVoiceOn((v) => !v); if (voiceOn) speechSynthesis?.cancel?.(); }}>{voiceOn ? "Mute interviewer voice" : "Unmute interviewer voice"}</button>
                </div>
                {clarify && <p className="notice" style={{ marginTop: 12, background: "rgba(255,255,255,.1)", color: "#fff" }}>{clarifyText}</p>}
                {audioNote && <p className="notice notice-warn" style={{ marginTop: 12 }} role="status">{audioNote}</p>}
                <div className="row" style={{ marginTop: 14 }}>
                  <label className="t-caption" htmlFor="rate" style={{ color: "var(--body-muted)" }}>Speech rate</label><input id="rate" type="range" min={0.6} max={1.6} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
                  <label className="t-caption" htmlFor="vol" style={{ color: "var(--body-muted)" }}>Volume</label><input id="vol" type="range" min={0} max={1} step={0.1} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
                </div>
              </>
            ) : <div className="skeleton" style={{ height: 120 }} aria-busy="true" />}
          </section>

          {q && !failed && (
            <section className="card stack" aria-labelledby="a-h">
              <h2 id="a-h" className="section-title">Your answer</h2>
              {paused && <p className="notice notice-warn">The interview is paused. Resume to keep answering. The clock is stopped.</p>}
              <div className="field">
                <label htmlFor="answer" className="sr-only">Your answer</label>
                <textarea id="answer" ref={ta} className="textarea" style={{ minHeight: 160 }} disabled={paused || busy} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer, or use the microphone. You can edit spoken text before sending."
                  onPaste={(e) => { if (monitoring && st.monitoring.clipboard) send("clipboard_paste", undefined, { chars: e.clipboardData.getData("text").length }); }} />
                {interim && <p className="hint" aria-live="polite">Hearing: {interim}</p>}
              </div>
              {recognized && <p className="hint">Speech recognition may make mistakes. Edit anything above. Your corrections are kept separately from the original recognition, and ratings use your corrected words.</p>}
              <div className="row">
                <button className="btn" onClick={() => void submit(false)} disabled={busy || paused || !text.trim()}>{busy ? "Sending…" : "Submit answer"}</button>
                <button className="btn btn-ghost" onClick={() => void submit(true)} disabled={busy || paused}>Skip question</button>
              </div>
            </section>
          )}
        </div>

        <aside className="stack" aria-label="Controls and transcript">
          <section className="card stack">
            <h2 className="section-title">Your devices</h2>
            <div className="video" aria-label="Camera preview">{camOn ? <video ref={video} muted playsInline aria-label="Your camera preview" /> : <span className="t-caption" style={{ padding: 16, textAlign: "center" }}>Camera is off. Optional.</span>}</div>
            {signals.map((s) => <p key={s} className="notice notice-warn" role="status">{SIGNAL_TIPS[s]}</p>)}
            {camErr && <p className="notice notice-warn" role="alert">{camErr}</p>}
            <div className="row">
              {st.consents.camera ? <button className="btn btn-ghost btn-sm" aria-pressed={camOn} onClick={() => (camOn ? disableCam() : void enableCam())}>{camOn ? "Turn camera off" : "Turn camera on"}</button> : <span className="hint">Camera not approved. Fine to skip.</span>}
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {micOn && <div className="meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}><div style={{ width: `${muted ? 0 : level * 100}%` }} /></div>}
              {micErr && <p className="notice notice-warn" role="alert">{micErr}</p>}
              <div className="row">
                {st.consents.microphone ? (
                  <>
                    <button className="btn btn-ghost btn-sm" aria-pressed={micOn} onClick={() => (micOn ? disableMic() : void enableMic())}>{micOn ? "Microphone on" : "Turn microphone on"}</button>
                    {micOn && <button className="btn btn-ghost btn-sm" aria-pressed={muted} onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>}
                  </>
                ) : <span className="hint">Microphone not approved. Type your answers.</span>}
              </div>
              {micOn && !muted && (
                <div className="row">
                  {dictationSupported ? <button className="btn btn-sm" aria-pressed={dictating} onClick={() => (dictating ? stopDictation() : startDictation())} disabled={paused}>{dictating ? "Stop dictation" : "Dictate answer"}</button> : <span className="hint">Live dictation is not supported in this browser.</span>}
                  <button className="btn btn-ghost btn-sm" aria-pressed={recording} onClick={() => void toggleRecord()} disabled={paused}>{recording ? "Stop and transcribe" : "Record a clip"}</button>
                </div>
              )}
            </div>
          </section>

          <section className="card stack">
            <h2 className="section-title">Interview</h2>
            <div className="row">
              {paused ? <button className="btn btn-sm" disabled={busy} onClick={() => void act("resume")}>Resume</button> : <button className="btn btn-ghost btn-sm" disabled={busy || failed} onClick={() => void act("pause")}>Pause</button>}
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmEnd(true)}>End interview</button>
            </div>
          </section>

          <section className="card stack" aria-labelledby="tr-h">
            <h2 id="tr-h" className="section-title">Transcript</h2>
            {segs.length === 0 ? <p className="muted t-caption">The conversation will appear here.</p> : (
              <div className="transcript" tabIndex={0} aria-label="Transcript so far" aria-live="polite">
                {segs.map((s) => (
                  <div key={s.id} className="seg">
                    <b>{s.speaker === "ai" ? "Interviewer" : "You"} · {mmss(s.atMs)} {s.corrected && <span className="badge badge-ok">Corrected</span>}</b>
                    {editing === s.id ? (
                      <div className="stack" style={{ gap: 8 }}><label className="sr-only" htmlFor={`e-${s.id}`}>Corrected text</label><textarea id={`e-${s.id}`} className="textarea" style={{ minHeight: 90 }} value={editText} onChange={(e) => setEditText(e.target.value)} /><div className="row"><button className="btn btn-sm" onClick={() => void saveEdit(s.id)} disabled={!editText.trim()}>Save correction</button><button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button></div></div>
                    ) : (
                      <>{s.text}{s.originalText && <details><summary className="t-caption muted">Original recognition</summary><p className="t-caption muted">{s.originalText}</p></details>}
                        {s.speaker === "candidate" && <div><button className="linkbtn t-caption" onClick={() => { setEditing(s.id); setEditText(s.text); }}>Correct this</button></div>}</>
                    )}
                  </div>
                ))}
                {interim && <div className="seg muted"><b>You (hearing…)</b>{interim}</div>}
              </div>
            )}
          </section>
        </aside>
      </div>

      {confirmEnd && (
        <div role="dialog" aria-modal="true" aria-labelledby="end-h" className="card" style={{ position: "fixed", inset: "auto 16px 16px auto", maxWidth: 420, zIndex: 60, boxShadow: "rgba(0,0,0,.22) 3px 5px 30px" }}>
          <h2 id="end-h" className="section-title">End the interview now?</h2>
          <p className="muted" style={{ margin: "8px 0 14px" }}>You will get a report for the {st.primaryAnswered} question{st.primaryAnswered === 1 ? "" : "s"} you answered. Unanswered questions are not rated.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn btn-ghost btn-sm" autoFocus onClick={() => setConfirmEnd(false)}>Keep going</button><button className="btn btn-sm" disabled={busy} onClick={() => { setConfirmEnd(false); void act("complete"); }}>End and see results</button></div>
        </div>
      )}
    </div>
  );
}
