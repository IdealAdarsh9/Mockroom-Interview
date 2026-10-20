import { NextResponse } from "next/server";
import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { deleteAccount } from "@/server/privacy";
import { SESSION_COOKIE } from "@/server/auth";
import { badRequest } from "@/server/errors";

export const runtime = "nodejs";
export const DELETE = route({ limit: [3, 600_000] }, async ({ req, user }) => {
  const b = await parseJson(req, z.object({ confirm: z.string() }));
  if (b.confirm !== "DELETE") throw badRequest('Type DELETE to confirm.', "confirmation_required");
  const out = deleteAccount(user);
  const res = NextResponse.json({ ok: true, ...out });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
