import { route } from "@/server/http";
import { deleteResume, resumePreview } from "@/server/resume/service";

export const runtime = "nodejs";
export const GET = route<{ id: string }>({ roles: ["candidate"] }, async ({ user, params }) => resumePreview(user.id, params.id));
export const DELETE = route<{ id: string }>({ roles: ["candidate"], limit: [20, 600_000] }, async ({ user, params }) => { deleteResume(user.id, params.id); return { ok: true }; });
