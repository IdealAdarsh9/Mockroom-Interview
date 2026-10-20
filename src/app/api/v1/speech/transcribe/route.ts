import { route } from "@/server/http";
import { getSpeechToText } from "@/server/speech";
import { badRequest } from "@/server/errors";
import { q } from "@/server/db";
import { getConsents } from "@/server/interview/service";

export const runtime = "nodejs";
const MAX = 5 * 1024 * 1024;
export const POST = route({ roles: ["candidate"], limit: [30, 60_000] }, async ({ req, user }) => {
  const sessionId = req.nextUrl.searchParams.get("interviewId") ?? "";
  const s = q.get<{ id: string }>("SELECT id FROM interview_sessions WHERE id = ? AND candidate_id = ?", sessionId, user.id);
  if (!s) throw badRequest("Missing interview.", "interview_required");
  if (!getConsents(s.id).microphone) throw badRequest("Microphone use was not approved for this interview.", "consent_required");
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX) throw badRequest("Audio is empty or larger than 5 MB.", "bad_audio");
  const stt = getSpeechToText();
  return stt.transcribe(buf, req.headers.get("content-type") ?? "audio/webm"); // audio is processed in memory and never stored
});
