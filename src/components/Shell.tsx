import { Nav, type NavLink } from "./Nav";
import { homeFor, type SessionUser } from "@/server/auth";
import { defaultProviderId } from "@/server/ai/router";

const LINKS: Record<SessionUser["role"], NavLink[]> = {
  candidate: [{ href: "/dashboard", label: "Dashboard" }, { href: "/resume", label: "Résumé" }, { href: "/interviews", label: "Interviews" }, { href: "/settings", label: "Settings" }],
  recruiter: [{ href: "/recruiter/dashboard", label: "Dashboard" }, { href: "/recruiter/candidates", label: "Candidates" }, { href: "/recruiter/interviews", label: "Interviews" }, { href: "/recruiter/reports", label: "Reports" }],
  admin: [{ href: "/admin/providers", label: "Providers" }, { href: "/admin/usage", label: "Usage" }, { href: "/admin/audit", label: "Audit log" }, { href: "/admin/settings", label: "Settings" }],
};

/** Navigation items are a convenience only. Every page and API route re-checks the role on the server. */
export function Shell({ user, children, bare }: { user: SessionUser; children: React.ReactNode; bare?: boolean }) {
  const demo = defaultProviderId() === "mock";
  return (
    <>
      <Nav links={LINKS[user.role]} user={{ name: user.name, role: user.role }} home={homeFor(user.role)} />
      {demo && (
        <div className="demo-strip" role="status"><strong>Demo mode.</strong> Questions, scoring and speech use built-in simulations, not a live AI model.</div>
      )}
      <main id="main" className={bare ? "" : "app-bg"}>{children}</main>
    </>
  );
}

export function PublicNav({ signedIn, home }: { signedIn?: boolean; home?: string }) {
  return <Nav links={signedIn && home ? [{ href: home, label: "Open app" }] : [{ href: "/#how", label: "How it works" }, { href: "/privacy", label: "Privacy" }]} user={null} home="/" />;
}
