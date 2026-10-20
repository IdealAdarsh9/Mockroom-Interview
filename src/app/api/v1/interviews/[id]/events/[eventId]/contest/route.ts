import { route, parseJson } from "@/server/http";
import { contestSchema } from "@/server/schemas";
import { contestEvent } from "@/server/interview/service";

export const runtime = "nodejs";
export const POST = route<{ id: string; eventId: string }>({ roles: ["candidate"], limit: [30, 60_000] }, async ({ req, user, params }) => contestEvent(user, params.id, params.eventId, (await parseJson(req, contestSchema)).note));
