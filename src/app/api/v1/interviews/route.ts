import { route, parseJson } from "@/server/http";
import { createInterviewSchema } from "@/server/schemas";
import { createInterview, listInterviews } from "@/server/interview/service";

export const runtime = "nodejs";
export const GET = route({ roles: ["candidate"] }, async ({ user }) => ({ interviews: listInterviews(user.id) }));
export const POST = route({ roles: ["candidate"], limit: [20, 600_000] }, async ({ req, user }) => {
  const b = await parseJson(req, createInterviewSchema);
  const id = createInterview(user, { ...b, focus: b.focus ?? [] });
  return Response.json({ id }, { status: 201 });
});
