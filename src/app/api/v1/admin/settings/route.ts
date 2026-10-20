import { route, parseJson } from "@/server/http";
import { settingsSchema } from "@/server/schemas";
import { getSettings, saveSettings } from "@/server/settings";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const GET = route({ roles: ["admin"] }, async () => ({ settings: getSettings() }));
export const PUT = route({ roles: ["admin"], limit: [30, 60_000] }, async ({ req, user }) => {
  const s = await parseJson(req, settingsSchema);
  saveSettings(s);
  audit({ id: user.id, role: user.role }, "settings.update", { type: "settings" }, { retention: s.retention, humanReviewRequired: s.humanReviewRequired });
  return { settings: getSettings() };
});
