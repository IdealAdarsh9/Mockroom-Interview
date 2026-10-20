import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { q, uid, nowIso } from "./db";
import { sha256, hashPassword, verifyPassword } from "./crypto";
import { badRequest, forbidden, unauthorized } from "./errors";

export const SESSION_COOKIE = "ais_session";
const SESSION_DAYS = 14;

export type Role = "candidate" | "recruiter" | "admin";
export type SessionUser = { id: string; email: string; name: string; role: Role; organizationId: string | null };

type UserRow = { id: string; email: string; name: string; password_hash: string; role: Role; deleted_at: string | null };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validatePassword(pw: string) {
  if (pw.length < 10) throw badRequest("Use at least 10 characters for your password.", "weak_password");
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw badRequest("Include both letters and numbers in your password.", "weak_password");
}

export async function registerCandidate(input: { email: string; name: string; password: string }) {
  const email = normalizeEmail(input.email);
  validatePassword(input.password);
  if (q.get("SELECT 1 FROM users WHERE email = ?", email)) {
    // Same generic message shape as other failures; avoids confirming which emails exist beyond the unavoidable.
    throw badRequest("An account with this email already exists. Try signing in.", "email_taken");
  }
  const id = uid();
  const hash = await hashPassword(input.password);
  q.run("INSERT INTO users (id, email, name, password_hash, role) VALUES (?,?,?,?, 'candidate')", id, email, input.name.trim(), hash);
  q.run("INSERT INTO candidate_profiles (user_id) VALUES (?)", id);
  return id;
}

export async function authenticate(emailRaw: string, password: string): Promise<string> {
  const row = q.get<UserRow>("SELECT * FROM users WHERE email = ?", normalizeEmail(emailRaw));
  // Always run a hash comparison so response time does not reveal whether the account exists.
  const ok = await verifyPassword(password, row?.password_hash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAA");
  if (!row || row.deleted_at || !ok) throw unauthorized("Email or password is incorrect.");
  return row.id;
}

export function createSession(userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  q.run("INSERT INTO auth_sessions (id, user_id, expires_at, user_agent) VALUES (?,?,?,?)", sha256(token), userId, expires.toISOString(), userAgent?.slice(0, 200) ?? null);
  return { token, expires };
}

export function destroySession(token: string) {
  q.run("DELETE FROM auth_sessions WHERE id = ?", sha256(token));
}

export function userFromToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const row = q.get<UserRow & { expires_at: string }>(
    `SELECT u.*, s.expires_at FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    sha256(token),
  );
  if (!row || row.deleted_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    q.run("DELETE FROM auth_sessions WHERE id = ?", sha256(token));
    return null;
  }
  const m = q.get<{ organization_id: string }>("SELECT organization_id FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1", row.id);
  return { id: row.id, email: row.email, name: row.name, role: row.role, organizationId: m?.organization_id ?? null };
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export const homeFor = (role: Role) => (role === "admin" ? "/admin/providers" : role === "recruiter" ? "/recruiter/dashboard" : "/dashboard");

/** For server components: redirect unauthenticated users, and send wrong-role users to their own home. */
export async function requirePageUser(roles?: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (roles && !roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

export function assertRole(user: SessionUser | null, roles?: Role[]): SessionUser {
  if (!user) throw unauthorized();
  if (roles && !roles.includes(user.role)) throw forbidden();
  return user;
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires,
  };
}

export function purgeExpiredAuthSessions() {
  q.run("DELETE FROM auth_sessions WHERE expires_at < ?", nowIso());
}
