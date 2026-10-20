import { NextResponse } from "next/server";
import { route, parseJson } from "@/server/http";
import { authenticate, createSession, homeFor, sessionCookieOptions, SESSION_COOKIE, userFromToken } from "@/server/auth";
import { loginSchema } from "@/server/schemas";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const POST = route({ public: true, limit: [10, 600_000] }, async ({ req }) => {
  const b = await parseJson(req, loginSchema);
  const id = await authenticate(b.email, b.password);
  const { token, expires } = createSession(id, req.headers.get("user-agent"));
  const user = userFromToken(token)!;
  audit({ id, role: user.role }, "auth.login", { type: "user", id });
  const res = NextResponse.json({ user: { id, name: user.name, email: user.email, role: user.role }, next: homeFor(user.role) });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expires));
  return res;
});
