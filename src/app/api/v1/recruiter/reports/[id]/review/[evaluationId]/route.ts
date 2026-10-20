import { route, parseJson } from "@/server/http";
import { reviewSchema } from "@/server/schemas";
import { reviewEvaluation } from "@/server/interview/report";

export const runtime = "nodejs";
export const POST = route<{ id: string; evaluationId: string }>({ roles: ["recruiter"], limit: [60, 60_000] }, async ({ req, user, params }) => reviewEvaluation(user, params.id, params.evaluationId, await parseJson(req, reviewSchema)));
