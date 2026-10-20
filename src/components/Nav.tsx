"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export type NavLink = { href: string; label: string };

export function Nav({ links, user, home }: { links: NavLink[]; user: { name: string; role: string } | null; home: string }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  async function signOut() {
    await api("/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.push("/");
    router.refresh();
  }
  return (
    <header className="bar-dark">
      <nav className="gnav" aria-label="Main">
        <Link className="brand" href={home}>Mockroom</Link>
        <button className="gnav-toggle" aria-expanded={open} aria-controls="gnav-links" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Menu"}</button>
        <div className="spacer" />
        <div id="gnav-links" className="gnav-links" data-open={open}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href || (l.href.length > 12 && path.startsWith(l.href)) ? "page" : undefined} onClick={() => setOpen(false)}>{l.label}</Link>
          ))}
          {user ? (
            <>
              <span style={{ color: "#a1a1a6" }} className="t-fine">{user.name}</span>
              <button className="linkbtn" style={{ color: "#2997ff", fontSize: 12, minHeight: 44 }} onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <Link href="/sign-in">Sign in</Link>
              <Link href="/register">Create account</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
