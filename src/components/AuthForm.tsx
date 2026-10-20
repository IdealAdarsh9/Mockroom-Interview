"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, fieldError } from "@/lib/api";

export function AuthForm({ mode }: { mode: "sign-in" | "register" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const reg = mode === "register";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      const body = reg ? { name: String(f.get("name")), email: String(f.get("email")), password: String(f.get("password")) } : { email: String(f.get("email")), password: String(f.get("password")) };
      const r = await api<{ next: string }>(reg ? "/auth/register" : "/auth/login", { method: "POST", body });
      router.push(r.next);
      router.refresh();
    } catch (x) {
      setErr(x);
      setBusy(false);
    }
  }
  const general = err instanceof ApiError && !err.fields.length ? err.message : null;
  const fe = (p: string) => fieldError(err, p);
  const pwMsg = fe("password") ?? (err instanceof ApiError && err.code === "weak_password" ? err.message : undefined);
  return (
    <form onSubmit={submit} noValidate className="stack" aria-busy={busy}>
      {general && err instanceof ApiError && err.code !== "weak_password" && <div className="notice notice-err" role="alert">{general}</div>}
      {reg && (
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" name="name" className="input" autoComplete="name" required aria-invalid={!!fe("name")} aria-describedby={fe("name") ? "name-err" : undefined} />
          {fe("name") && <span id="name-err" className="field-error">{fe("name")}</span>}
        </div>
      )}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" inputMode="email" className="input" autoComplete="email" required aria-invalid={!!fe("email")} aria-describedby={fe("email") ? "email-err" : undefined} />
        {fe("email") && <span id="email-err" className="field-error">{fe("email")}</span>}
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" autoComplete={reg ? "new-password" : "current-password"} required aria-invalid={!!pwMsg} aria-describedby={pwMsg ? "pw-err" : reg ? "pw-hint" : undefined} />
        {reg && !pwMsg && <span id="pw-hint" className="hint">At least 10 characters, with letters and numbers.</span>}
        {pwMsg && <span id="pw-err" className="field-error">{pwMsg}</span>}
      </div>
      <button className="btn" type="submit" disabled={busy}>{busy ? "One moment…" : reg ? "Create account" : "Sign in"}</button>
      <p className="t-caption muted">
        {reg ? <>Already registered? <Link href="/sign-in">Sign in</Link>.</> : <>New here? <Link href="/register">Create an account</Link>.</>}
        {" "}By continuing you agree to the <Link href="/privacy">privacy and consent terms</Link>.
      </p>
    </form>
  );
}
