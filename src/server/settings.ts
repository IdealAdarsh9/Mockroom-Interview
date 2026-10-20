import { q, json } from "./db";

export type AppSettings = {
  retention: { resumeDays: number; transcriptDays: number; derivedDays: number };
  monitoringDefaults: { visibility: boolean; focus: boolean; connection: boolean; clipboard: boolean; fullscreen: boolean };
  humanReviewRequired: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  retention: { resumeDays: 365, transcriptDays: 180, derivedDays: 365 },
  monitoringDefaults: { visibility: true, focus: true, connection: true, clipboard: false, fullscreen: false },
  humanReviewRequired: true,
};

export function getSettings(): AppSettings {
  const row = q.get<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = 'app'");
  const saved = json<Partial<AppSettings>>(row?.value_json, {});
  return {
    retention: { ...DEFAULT_SETTINGS.retention, ...saved.retention },
    monitoringDefaults: { ...DEFAULT_SETTINGS.monitoringDefaults, ...saved.monitoringDefaults },
    humanReviewRequired: saved.humanReviewRequired ?? DEFAULT_SETTINGS.humanReviewRequired,
  };
}

export function saveSettings(s: AppSettings) {
  q.run(
    "INSERT INTO app_settings (key, value_json, updated_at) VALUES ('app', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
    JSON.stringify(s),
    new Date().toISOString(),
  );
}
