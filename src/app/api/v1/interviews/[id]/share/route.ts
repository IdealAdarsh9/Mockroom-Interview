import { route, parseJson } from "@/server/http";
import { shareSchema } from "@/server/schemas";
import { setShare } from "@/server/interview/service";

export const runtime = "nodejs";
export const POST = route<{ id: string }>({ roles: ["candidate"], limit: [30, 60_000] }, async ({ req, user, params }) => setShare(user, params.id, (await parseJson(req, shareSchema)).share));
