import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath: process.env.CHROMIUM_PATH || (require("node:fs").existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined) } } },
  ],
  webServer: {
    command: `rm -rf data/e2e && mkdir -p data/e2e && DATABASE_PATH=./data/e2e/app.db UPLOAD_DIR=./data/e2e/uploads RATE_LIMIT_DISABLED=1 APP_ORIGIN=http://localhost:${PORT} npm run db:migrate && DATABASE_PATH=./data/e2e/app.db UPLOAD_DIR=./data/e2e/uploads npm run db:seed && DATABASE_PATH=./data/e2e/app.db UPLOAD_DIR=./data/e2e/uploads RATE_LIMIT_DISABLED=1 APP_ORIGIN=http://localhost:${PORT} npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/health`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
