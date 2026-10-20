import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, forbidden } from "./errors";
import { assertRole, SESSION_COOKIE, userFromToken, type Role, type SessionUser } from "./auth";
import { rateLimit } from "./ratelimit";
import { env } from "./env";

type Ctx<P> = { params: Promise<P> };
type Opts = {
  /** Omit for public endpoints (sign-in, register). */
  roles?: Role[];
  public?: boolean;
  /** [limit, windowMs] keyed per user (or IP when anonymous) and route. */
  limit?: [number, number];
};

export type Handler<P> = (a: { req: NextRequest; user: SessionUser; params: P; ip: string }) => Promise<Response | object | void>;

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** CSRF defence for cookie auth: SameSite=Lax plus an Origin check on every state-changing request. */
function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, tests) cannot be CSRF vectors without a cookie jar
  const allowed = env.appOrigin ?? `${req.nextUrl.protocol}//${req.headers.get("host")}`;
  const hostAllowed = new URL(origin).host === new URL(allowed).host || new URL(origin).host === req.headers.get("host");
  if (!hostAllowed) throw forbidden("Cross-origin request blocked.");
}

export function route<P = Record<string, never>>(opts: Opts, handler: Handler<P>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    try {
      assertSameOrigin(req);
      const ip = clientIp(req);
      let user = null as SessionUser | null;
      if (!opts.public) {
        user = assertRole(userFromToken(req.cookies.get(SESSION_COOKIE)?.value), opts.roles);
      }
      if (opts.limit) rateLimit(`${req.method}:${new URL(req.url).pathname.replace(/[0-9a-f-]{36}/g, ":id")}:${user?.id ?? ip}`, opts.limit[0], opts.limit[1]);
      const params = ctx?.params ? await ctx.params : ({} as P);
      const result = await handler({ req, user: user as SessionUser, params, ip });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}

export function errorResponse(err: unknown, requestId: string) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Some fields are invalid.", fields: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    const retry = (err.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
    if (err.status === 429 && retry) headers["Retry-After"] = String(retry);
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.status < 500 ? err.details : undefined } }, { status: err.status, headers });
  }
  // Never leak stack traces or internals: log a short, content-free line server-side and return a reference.
  console.error(`[api ${requestId}] unhandled`, err instanceof Error ? err.name + ": " + err.message.slice(0, 200) : "unknown");
  return NextResponse.json({ error: { code: "internal_error", message: "Something went wrong on our side. Please try again.", requestId } }, { status: 500 });
}

export async function parseJson<T>(req: NextRequest, schema: { parse: (v: unknown) => T }): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError(400, "invalid_json", "Request body must be valid JSON.");
  }
  return schema.parse(body);
}
