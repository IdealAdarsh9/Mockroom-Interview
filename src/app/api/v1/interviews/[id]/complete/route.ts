import { route } from "@/server/http";
import { completeInterview } from "@/server/interview/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = route<{ id: string }>({ roles: ["candidate"], limit: [60, 60_000] }, async ({ user, params }) => completeInterview(user, params.id));
