import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { destroySession, SESSION_COOKIE } from "@/server/auth";

export const runtime = "nodejs";
export const POST = route({}, async ({ req }) => {
  const t = req.cookies.get(SESSION_COOKIE)?.value;
  if (t) destroySession(t);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
