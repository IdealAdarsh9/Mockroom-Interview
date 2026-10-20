import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicNav } from "@/components/Shell";
import { AuthForm } from "@/components/AuthForm";
import { currentUser, homeFor } from "@/server/auth";

export const metadata: Metadata = { title: "Create account" };
export default async function Register() {
  const u = await currentUser();
  if (u) redirect(homeFor(u.role));
  return (
    <>
      <PublicNav />
      <main id="main" className="app-bg">
        <div className="wrap" style={{ maxWidth: 480, padding: "64px 22px" }}>
          <h1 className="t-display" style={{ marginBottom: 24 }}>Create your account</h1>
          <div className="card"><AuthForm mode="register" /></div>
        </div>
      </main>
    </>
  );
}
