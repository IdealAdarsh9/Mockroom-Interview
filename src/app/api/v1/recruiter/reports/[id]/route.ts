import { route } from "@/server/http";
import { getSharedReport } from "@/server/interview/report";

export const runtime = "nodejs";
export const GET = route<{ id: string }>({ roles: ["recruiter"], limit: [120, 60_000] }, async ({ user, params }) => getSharedReport(user, params.id));
