import { route, parseJson } from "@/server/http";
import { consentSchema } from "@/server/schemas";
import { recordConsent } from "@/server/interview/service";

export const runtime = "nodejs";
export const POST = route<{ id: string }>({ roles: ["candidate"], limit: [60, 60_000] }, async ({ req, user, params }) => ({ consents: recordConsent(user, params.id, (await parseJson(req, consentSchema)).items) }));
