import { NextResponse } from "next/server";
import { route, parseJson } from "@/server/http";
import { registerCandidate, createSession, sessionCookieOptions, SESSION_COOKIE } from "@/server/auth";
import { registerSchema } from "@/server/schemas";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const POST = route({ public: true, limit: [8, 600_000] }, async ({ req }) => {
  const b = await parseJson(req, registerSchema);
  const id = await registerCandidate(b);
  const { token, expires } = createSession(id, req.headers.get("user-agent"));
  audit({ id, role: "candidate" }, "auth.register", { type: "user", id });
  const res = NextResponse.json({ user: { id, name: b.name.trim(), email: b.email.trim().toLowerCase(), role: "candidate" }, next: "/dashboard" }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expires));
  return res;
});
