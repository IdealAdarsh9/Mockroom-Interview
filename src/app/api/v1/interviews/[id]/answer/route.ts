import { route, parseJson } from "@/server/http";
import { answerSchema } from "@/server/schemas";
import { submitAnswer } from "@/server/interview/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = route<{ id: string }>({ roles: ["candidate"], limit: [60, 60_000] }, async ({ req, user, params }) => submitAnswer(user, params.id, await parseJson(req, answerSchema)));
