import { route, parseJson } from "@/server/http";
import { correctionSchema } from "@/server/schemas";
import { correctTranscript } from "@/server/interview/service";

export const runtime = "nodejs";
export const PATCH = route<{ id: string; segmentId: string }>({ roles: ["candidate"], limit: [60, 60_000] }, async ({ req, user, params }) => correctTranscript(user, params.id, params.segmentId, (await parseJson(req, correctionSchema)).text));
