import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicNav } from "@/components/Shell";
import { AuthForm } from "@/components/AuthForm";
import { currentUser, homeFor } from "@/server/auth";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Sign in" };
export default async function SignIn() {
  const u = await currentUser();
  if (u) redirect(homeFor(u.role));
  return (
    <>
      <PublicNav />
      <main id="main" className="app-bg">
        <div className="wrap" style={{ maxWidth: 480, padding: "64px 22px" }}>
          <h1 className="t-display" style={{ marginBottom: 24 }}>Sign in</h1>
          <div className="card"><AuthForm mode="sign-in" /></div>
          {env.demoMode && (
            <div className="notice notice-info" style={{ marginTop: 20 }}>
              <strong>Demo accounts</strong> (local demo data only). Password <code>DemoPass12345</code>:
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                <li>demo.candidate@example.com</li>
                <li>demo.recruiter@example.com</li>
                <li>demo.admin@example.com</li>
              </ul>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
