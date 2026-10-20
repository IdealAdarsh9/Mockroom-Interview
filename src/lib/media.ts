/** Browser media helpers. Nothing here sends video or audio anywhere: analysis happens locally on small downscaled frames. */

export function describeMediaError(e: unknown, kind: "microphone" | "camera"): string {
  const name = e instanceof DOMException ? e.name : "";
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return `This browser or connection does not support ${kind} access (it needs HTTPS or localhost). You can continue with text answers.`;
  switch (name) {
    case "NotAllowedError": case "SecurityError": return `Access to the ${kind} was blocked. Allow it in your browser's site settings, or continue with text answers.`;
    case "NotFoundError": case "OverconstrainedError": return `No ${kind} was found. Connect one, or continue with text answers.`;
    case "NotReadableError": case "AbortError": return `The ${kind} is in use by another app or could not start. Close other apps using it and try again.`;
    default: return `The ${kind} could not be started. You can continue with text answers.`;
  }
}

export function startMeter(stream: MediaStream, onLevel: (v: number) => void): () => void {
  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctx || !stream.getAudioTracks().length) return () => {};
  const ctx = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  let raf = 0;
  const tick = () => {
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const b of buf) sum += ((b - 128) / 128) ** 2;
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    raf = requestAnimationFrame(tick);
  };
  tick();
  let stopped = false;
  // Safe to call more than once: the lobby stops the meter from a timer, from "Start" and from unmount cleanup.
  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    try { src.disconnect(); } catch { /* already disconnected */ }
    if (ctx.state !== "closed") ctx.close().catch(() => {});
    onLevel(0);
  };
}

export type CameraSignal = "dark" | "frozen" | "no_face" | "lost";
export const SIGNAL_TIPS: Record<CameraSignal, string> = {
  dark: "The picture looks dark. Face a window or lamp if you can.",
  frozen: "The camera image has not changed for a while. Check that the camera is still working.",
  no_face: "No face was detected in frame. Check the camera angle. (This is only a framing tip.)",
  lost: "The camera stopped sending video.",
};

/**
 * Local-only camera diagnostics: brightness, frozen-frame and (where the browser offers FaceDetector) framing.
 * It never reads expressions, gaze, identity or emotion, and it keeps no frames.
 */
export class CameraDiagnostics {
  private timer: ReturnType<typeof setInterval> | undefined;
  private prev: Uint8ClampedArray | null = null;
  private counts: Record<CameraSignal, number> = { dark: 0, frozen: 0, no_face: 0, lost: 0 };
  private since: Partial<Record<CameraSignal, number>> = {};
  private canvas = document.createElement("canvas");
  private detector: { detect(i: CanvasImageSource): Promise<unknown[]> } | null = null;
  constructor(private video: HTMLVideoElement, private onActive: (active: CameraSignal[]) => void, private onResolved: (s: CameraSignal, durationMs: number) => void, private intervalMs = 2000) {
    this.canvas.width = 32; this.canvas.height = 24;
    const FD = (window as unknown as { FaceDetector?: new (o?: object) => { detect(i: CanvasImageSource): Promise<unknown[]> } }).FaceDetector;
    if (FD) { try { this.detector = new FD({ fastMode: true, maxDetectedFaces: 1 }); } catch { this.detector = null; } }
  }
  start() { this.timer = setInterval(() => void this.tick(), this.intervalMs); }
  stop() { if (this.timer) clearInterval(this.timer); for (const s of Object.keys(this.since) as CameraSignal[]) this.resolve(s); this.onActive([]); }
  private set(s: CameraSignal, on: boolean, threshold: number) {
    this.counts[s] = on ? this.counts[s] + 1 : 0;
    if (on && this.counts[s] === threshold) this.since[s] = Date.now() - threshold * this.intervalMs;
    if (!on && this.since[s] !== undefined) this.resolve(s);
  }
  private resolve(s: CameraSignal) { const t = this.since[s]; if (t !== undefined) { this.onResolved(s, Date.now() - t); delete this.since[s]; } }
  private async tick() {
    const v = this.video;
    const track = (v.srcObject as MediaStream | null)?.getVideoTracks()[0];
    const lost = !track || track.readyState === "ended" || !track.enabled;
    if (lost || v.readyState < 2) { this.set("lost", lost, 1); this.emit(); return; }
    this.set("lost", false, 1);
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, 32, 24);
    const data = ctx.getImageData(0, 0, 32, 24).data;
    let luma = 0, diff = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      luma += l;
      if (this.prev) diff += Math.abs(l - (0.2126 * this.prev[i] + 0.7152 * this.prev[i + 1] + 0.0722 * this.prev[i + 2]));
    }
    const px = data.length / 4;
    luma /= px; diff /= px;
    this.set("dark", luma < 28, 3);
    // Sensor noise normally keeps diff above ~0.3; a truly frozen feed is flat. Dark scenes are excluded to avoid false positives.
    if (this.prev) this.set("frozen", diff < 0.05 && luma >= 28, 6);
    this.prev = new Uint8ClampedArray(data);
    if (this.detector) {
      try { const faces = await this.detector.detect(this.canvas); this.set("no_face", faces.length === 0, 3); } catch { this.detector = null; }
    }
    this.emit();
  }
  private emit() { this.onActive((Object.keys(this.since) as CameraSignal[])); }
}
