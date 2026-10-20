import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export const PW = "DemoPass12345";
export const DEMO = { candidate: "demo.candidate@example.com", recruiter: "demo.recruiter@example.com", admin: "demo.admin@example.com" };

export async function signIn(page: Page, email: string, password = PW) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|recruiter|admin/, { timeout: 20_000 }).catch(() => {});
}

export async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PW + "x9");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/dashboard/, { timeout: 20_000 });
}

export const uniq = (p: string) => `${p}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;

export async function a11y(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target} ${JSON.stringify(v.nodes[0]?.any?.[0]?.data ?? {}).slice(0, 200)}`), "serious/critical axe violations").toEqual([]);
}
