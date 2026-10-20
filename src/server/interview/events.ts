/**
 * Session-integrity events are neutral technical observations. This module only describes what the browser reported.
 * It never scores, ranks or labels anyone, and nothing here is imported by the evaluation or report-scoring code.
 */
export const INTEGRITY_TYPES = ["tab_hidden", "window_blur", "connection_lost", "fullscreen_exit", "clipboard_paste"] as const;
export const CAMERA_TYPES = ["camera_unavailable", "camera_frozen", "framing_issue", "low_light"] as const;
export const ALL_EVENT_TYPES = [...INTEGRITY_TYPES, ...CAMERA_TYPES] as const;
export type EventType = (typeof ALL_EVENT_TYPES)[number];

export const INTERPRETATION =
  "Unverified technical signal. It has many ordinary causes (notifications, switching apps, an unstable connection) and is not evidence of misconduct. It does not affect scores.";

const clock = (iso: string) => new Date(iso).toISOString().slice(11, 19) + " UTC";
const secs = (ms?: number | null) => (ms && ms >= 1000 ? `${Math.round(ms / 1000)}s` : "under 1s");

export function describeEvent(type: EventType, occurredAt: string, durationMs?: number | null, meta: Record<string, unknown> = {}): string {
  const at = clock(occurredAt);
  switch (type) {
    case "tab_hidden": return `Browser tab was hidden at ${at} for ${secs(durationMs)}.`;
    case "window_blur": return `Browser window lost focus at ${at} for ${secs(durationMs)}.`;
    case "connection_lost": return `Network connection was reported offline at ${at} for ${secs(durationMs)}.`;
    case "fullscreen_exit": return `Fullscreen mode was exited at ${at}.`;
    case "clipboard_paste": return `A paste action occurred in the answer box at ${at} (${Number(meta.chars ?? 0)} characters; content not recorded).`;
    case "camera_unavailable": return `The camera stream became unavailable at ${at} for ${secs(durationMs)}.`;
    case "camera_frozen": return `The camera image stopped changing at ${at} for ${secs(durationMs)}.`;
    case "framing_issue": return `The camera framing check reported no visible face at ${at} for ${secs(durationMs)}.`;
    case "low_light": return `The camera image was dark at ${at} for ${secs(durationMs)}.`;
  }
}

export type MonitoringPolicy = {
  enabled: boolean;
  visibility: boolean;
  focus: boolean;
  connection: boolean;
  clipboard: boolean;
  fullscreen: boolean;
};

export function policyAllows(p: MonitoringPolicy, type: EventType): boolean {
  if (!p.enabled) return false;
  switch (type) {
    case "tab_hidden": return p.visibility;
    case "window_blur": return p.focus;
    case "connection_lost": return p.connection;
    case "clipboard_paste": return p.clipboard;
    case "fullscreen_exit": return p.fullscreen;
    default: return true; // camera diagnostics are governed by their own consent, not by this policy
  }
}

export const isCameraType = (t: EventType) => (CAMERA_TYPES as readonly string[]).includes(t);
