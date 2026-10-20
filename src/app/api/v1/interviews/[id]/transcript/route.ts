import { route } from "@/server/http";
import { getTranscript } from "@/server/interview/service";

export const runtime = "nodejs";
export const GET = route<{ id: string }>({ roles: ["candidate"] }, async ({ user, params }) => ({ segments: getTranscript(user, params.id) }));
