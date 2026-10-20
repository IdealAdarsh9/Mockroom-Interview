import { defineConfig } from "vitest/config";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iv-test-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
process.env.UPLOAD_DIR = path.join(dir, "uploads");

export default defineConfig({
  test: { include: ["tests/unit/**/*.test.ts"], testTimeout: 30000, fileParallelism: false, env: { DATABASE_PATH: process.env.DATABASE_PATH, UPLOAD_DIR: process.env.UPLOAD_DIR } },
});
