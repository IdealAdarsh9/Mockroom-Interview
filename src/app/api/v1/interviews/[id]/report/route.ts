import { route } from "@/server/http";
import { getReportFor } from "@/server/interview/report";

export const runtime = "nodejs";
export const GET = route<{ id: string }>({ roles: ["candidate"] }, async ({ user, params }) => getReportFor(user, params.id));
