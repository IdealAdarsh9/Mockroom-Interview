import { route } from "@/server/http";
import { listSharedInterviews } from "@/server/interview/report";

export const runtime = "nodejs";
export const GET = route({ roles: ["recruiter"] }, async ({ user }) => ({ interviews: listSharedInterviews(user) }));
