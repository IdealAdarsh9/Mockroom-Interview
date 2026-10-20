import { route } from "@/server/http";
import { deleteInterview, getState } from "@/server/interview/service";

export const runtime = "nodejs";
export const GET = route<{ id: string }>({ roles: ["candidate"] }, async ({ user, params }) => getState(user, params.id));
export const DELETE = route<{ id: string }>({ roles: ["candidate"], limit: [30, 600_000] }, async ({ user, params }) => deleteInterview(user, params.id));
