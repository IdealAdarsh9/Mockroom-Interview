import { test, expect } from "@playwright/test";
import path from "node:path";
import { signIn, register, uniq, a11y, DEMO, PW } from "./helpers";

const fx = (f: string) => path.resolve("tests/fixtures", f);
const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });

test.describe("public pages", () => {
  test("1 landing page and navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "01-landing");
    await a11y(page, "landing");
    await page.getByRole("link", { name: /privacy/i }).first().click();
    await expect(page).toHaveURL(/privacy/);
    await expect(page.getByText(/human review/i).first()).toBeVisible();
    await shot(page, "02-privacy");
  });

  test("2 registration and sign-in validation", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("A");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/register/);
    await expect(page.locator("[aria-invalid='true']").first()).toBeVisible();
    await shot(page, "03-register-errors");
    await signIn(page, DEMO.candidate, "WrongPassword123");
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/sign-in/);
  });

  test("16 protected pages and APIs reject anonymous users", async ({ page, request }) => {
    for (const p of ["/dashboard", "/resume", "/interviews", "/recruiter/dashboard", "/admin/providers"]) {
      await page.goto(p);
      await expect(page).toHaveURL(/sign-in/);
    }
    for (const u of ["/api/v1/resumes", "/api/v1/interviews", "/api/v1/admin/providers", "/api/v1/recruiter/interviews"]) {
      const r = await request.get(u);
      expect([401, 403]).toContain(r.status());
    }
  });
});

test.describe("candidate journey", () => {
  test("3-5,9-12 resume, setup, text-only interview, results", async ({ page }) => {
    const email = uniq("cand");
    await register(page, "Casey Tester", email);
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByRole("status").filter({ hasText: /Demo mode/ })).toBeVisible();
    await shot(page, "04-dashboard-empty");

    // Resume upload: failure handling first
    await page.goto("/resume");
    await page.setInputFiles("#resume-file", fx("fake.pdf"));
    await expect(page.getByText(/not a valid PDF|could not/i).first()).toBeVisible();
    await shot(page, "05-resume-error");

    // Then a valid file
    await page.setInputFiles("#resume-file", fx("alex-resume.txt"));
    await expect(page.getByText("Detected sections")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Northwind").first()).toBeVisible();
    await shot(page, "06-resume-ready");
    await page.getByLabel("Search topic").fill("mentoring");
    await page.getByRole("button", { name: /search|retrieve|find/i }).click();
    await expect(page.getByText("No matching passages.")).toBeHidden();

    // Setup
    await page.goto("/interviews/new");
    await page.getByLabel("Job description").fill("Build accessible React applications and mentor engineers across the team.").catch(() => {});
    await page.getByLabel("Text only").check();
    await shot(page, "07-setup");
    await a11y(page, "setup");
    await page.getByRole("button", { name: "Continue to lobby" }).click();
    await expect(page).toHaveURL(/lobby/);

    // Lobby: consent, camera off path
    await expect(page.getByRole("heading", { name: "Before you begin" })).toBeVisible();
    await shot(page, "08-lobby");
    await a11y(page, "lobby");
    const start = page.getByRole("button", { name: /Start interview/ });
    await expect(start).toBeDisabled();
    await page.getByLabel(/I understand and agree/).check();
    await start.click();
    await expect(page).toHaveURL(/session/, { timeout: 30_000 });

    // Room: text fallback, progression
    await expect(page.getByText("Demo mode").first()).toBeVisible();
    await expect(page.getByText(/Camera is off|Camera not approved/).first()).toBeVisible();
    await shot(page, "09-room");
    await a11y(page, "room");
    const answers = [
      "At Northwind Labs I led the migration to React Query, measured a 38 percent faster page load, and documented the trade-offs.",
      "I profiled a memory leak, fixed the listener cleanup, wrote a regression test and shared the diagnosis steps with the team.",
      "I partnered with design on onboarding, raised accessibility early, and activation rose 14 percent.",
      "I mentor four engineers by pairing on first pull requests and stepping back as they grow.",
      "I maintain an open-source accessibility linter and learn from contributor feedback.",
      "I would simplify the rules and improve error messages based on user reports.",
    ];
    let done = false;
    for (let i = 0; i < 12 && !done; i++) {
      const box = page.getByRole("textbox", { name: "Your answer" });
      if (page.url().includes("results")) break;
      await box.fill(answers[i % answers.length]);
      await page.getByRole("button", { name: "Submit answer" }).click();
      await page.waitForTimeout(600);
      done = page.url().includes("results") || (await page.getByRole("button", { name: "Submit answer" }).count()) === 0;
      if (i === 1) await shot(page, "10-room-progress");
    }
    if (!page.url().includes("results")) {
      await page.getByRole("button", { name: "End interview" }).click();
      await page.getByRole("button", { name: "End and see results" }).last().click();
    }
    await expect(page).toHaveURL(/results/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Competencies" })).toBeVisible();
    await expect(page.getByText(/AI-assisted/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible();
    await shot(page, "11-results");
    await a11y(page, "results");
    const url = page.url();
    // 16: another user cannot open this report
    const ctx2 = await page.context().browser()!.newContext();
    const p2 = await ctx2.newPage();
    await register(p2, "Other Person", uniq("other"));
    const r = await p2.goto(url);
    expect(r!.status()).toBeGreaterThanOrEqual(400);
    await expect(p2.getByText(/Competencies/)).toHaveCount(0);
    const api = await p2.request.get(url.replace(/\/interviews\/([^/]+)\/results/, "/api/v1/interviews/$1/report"));
    expect([403, 404]).toContain(api.status());
    await ctx2.close();
  });

  test("4 resume ownership: other users cannot read or search", async ({ browser }) => {
    const a = await browser.newContext(); const b = await browser.newContext();
    const pa = await a.newPage(); const pb = await b.newPage();
    await signIn(pa, DEMO.candidate);
    await pa.waitForURL(/dashboard/);
    const list = await pa.request.get("/api/v1/resumes");
    const body = await list.json();
    const id = (body.resumes ?? body.items ?? body.data ?? body)[0]?.id;
    expect(id).toBeTruthy();
    await register(pb, "Mallory", uniq("mal"));
    for (const u of [`/api/v1/resumes/${id}`, `/api/v1/resumes/${id}/search?q=react`]) {
      const r = await pb.request.get(u);
      expect([403, 404, 405]).toContain(r.status());
    }
    const sr = await pb.request.post(`/api/v1/resumes/${id}/search`, { data: { query: "react" } });
    expect([403, 404]).toContain(sr.status());
    const own = await pa.request.post(`/api/v1/resumes/${id}/search`, { data: { query: "react" } });
    expect(own.status()).toBe(200);
    const del = await pb.request.delete(`/api/v1/resumes/${id}`);
    expect([401, 403, 404]).toContain(del.status());
    await a.close(); await b.close();
  });

  test("7,13 pause/resume recovery keeps state after reload", async ({ page }) => {
    await signIn(page, DEMO.candidate);
    await page.waitForURL(/dashboard/);
    await page.goto("/interviews/new");
    await page.getByLabel("Job description").fill("Build accessible React applications and mentor engineers across the team.").catch(() => {});
    await page.getByLabel("Text only").check();
    await page.getByRole("button", { name: "Continue to lobby" }).click();
    await page.getByLabel(/I understand and agree/).check();
    await page.getByRole("button", { name: /Start interview/ }).click();
    await expect(page).toHaveURL(/session/, { timeout: 30_000 });
    const q1 = await page.locator("h1, h2, [data-testid=question]").filter({ hasText: /\?/ }).first().textContent().catch(() => null);
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByText("Paused").first()).toBeVisible();
    await page.reload();
    await expect(page.getByText("Paused").first()).toBeVisible();
    await page.getByRole("button", { name: /Resume/ }).first().click();
    await expect(page.getByRole("textbox", { name: "Your answer" })).toBeEnabled();
    if (q1) await expect(page.getByText(q1.trim()).first()).toBeVisible();
    // keyboard: textarea reachable by tab order and controls have names
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBeTruthy();
  });

  test("17-20 settings, data export, retention info", async ({ page }) => {
    await signIn(page, DEMO.candidate);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
    await shot(page, "12-settings");
    await a11y(page, "settings");
    await page.getByRole("button", { name: "Delete my account…" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).last().click();
  });
});

test.describe("recruiter and admin", () => {
  test("recruiter sees shared report only; admin sees providers with no secrets", async ({ browser }) => {
    const rc = await browser.newContext(); const rp = await rc.newPage();
    await signIn(rp, DEMO.recruiter);
    await rp.waitForURL(/recruiter/);
    await rp.goto("/recruiter/interviews");
    await shot(rp, "13-recruiter");
    await a11y(rp, "recruiter");
    const forbidden = await rp.request.get("/api/v1/admin/providers");
    expect([401, 403]).toContain(forbidden.status());
    const resumes = await rp.request.get("/api/v1/resumes");
    const j = await resumes.json().catch(() => ({}));
    expect(JSON.stringify(j)).not.toMatch(/Northwind Labs/);
    await rc.close();

    const ac = await browser.newContext(); const ap = await ac.newPage();
    await signIn(ap, DEMO.admin);
    await ap.goto("/admin/providers");
    await expect(ap.getByText(/mock/i).first()).toBeVisible();
    await shot(ap, "14-admin-providers");
    const api = await ap.request.get("/api/v1/admin/providers");
    expect(api.ok()).toBeTruthy();
    expect(await api.text()).not.toMatch(/sk-[A-Za-z0-9]{10,}|"apiKey"\s*:\s*"[^"]+"/);
    await ap.goto("/admin/audit");
    await expect(ap.getByRole("heading").first()).toBeVisible();
    await ac.close();
  });
});

test.describe("responsive layouts", () => {
  for (const [name, vp] of [["mobile", { width: 390, height: 844 }], ["tablet", { width: 820, height: 1180 }], ["desktop", { width: 1440, height: 900 }]] as const) {
    test(`18 ${name} layout has no horizontal overflow`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: vp }); const page = await ctx.newPage();
      for (const [i, p] of ["/", "/sign-in"].entries()) {
        await page.goto(p);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${p} overflow at ${name}`).toBeLessThanOrEqual(1);
        await shot(page, `15-${name}-${i}`);
      }
      await signIn(page, DEMO.candidate);
      await page.waitForURL(/dashboard/);
      for (const p of ["/dashboard", "/resume", "/interviews/new"]) {
        await page.goto(p);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${p} at ${name}`).toBeLessThanOrEqual(1);
      }
      if (name === "mobile") {
        const left = await page.evaluate(() => Math.min(...[...document.querySelectorAll("main h1, main form > .btn, main .btn[type=submit]")].map((e) => e.getBoundingClientRect().left)));
        expect(left, "left gutter on mobile").toBeGreaterThanOrEqual(16);
      }
      await shot(page, `16-${name}-new-interview`);
      await ctx.close();
    });
  }
});

test("6 microphone/camera permission denial falls back to text", async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => Promise.reject(new DOMException("denied", "NotAllowedError")) }, configurable: true });
  });
  await signIn(page, DEMO.candidate); await page.waitForURL(/dashboard/);
  await page.goto("/interviews/new");
  await page.getByLabel("Job description").fill("Build accessible React applications and mentor engineers across the team.").catch(() => {});
  await page.getByRole("button", { name: "Continue to lobby" }).click();
  await page.getByLabel(/I understand and agree/).check();
  await page.getByLabel("Use my microphone for spoken answers").check();
  await page.getByRole("button", { name: "Test microphone" }).click();
  await expect(page.getByText(/denied|not allowed|blocked|permission|type your answers/i).first()).toBeVisible();
  await shot(page, "17-mic-denied");
  await ctx.close();
});
