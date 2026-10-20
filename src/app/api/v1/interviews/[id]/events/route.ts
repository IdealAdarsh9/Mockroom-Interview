import { route, parseJson } from "@/server/http";
import { eventSchema } from "@/server/schemas";
import { listOwnEvents, recordEvent } from "@/server/interview/service";

export const runtime = "nodejs";
export const GET = route<{ id: string }>({ roles: ["candidate"] }, async ({ user, params }) => ({ events: listOwnEvents(user, params.id) }));
export const POST = route<{ id: string }>({ roles: ["candidate"], limit: [120, 60_000] }, async ({ req, user, params }) => recordEvent(user, params.id, await parseJson(req, eventSchema)));
