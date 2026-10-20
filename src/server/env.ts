import path from "node:path";

const root = process.cwd();

export const env = {
  get appSecret(): string {
    const s = process.env.APP_SECRET;
    if (s && s.length >= 16) return s;
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_SECRET must be set (16+ characters) in production.");
    }
    return "dev-only-insecure-secret-do-not-use";
  },
  get databasePath(): string {
    return path.resolve(root, process.env.DATABASE_PATH ?? "./data/app.db");
  },
  get uploadDir(): string {
    return path.resolve(root, process.env.UPLOAD_DIR ?? "./data/uploads");
  },
  get appOrigin(): string | undefined {
    return process.env.APP_ORIGIN || undefined;
  },
  get demoMode(): boolean {
    return (process.env.DEMO_MODE ?? "true") !== "false";
  },
  get embeddingProvider(): "local" | "openai" {
    return process.env.EMBEDDING_PROVIDER === "openai" ? "openai" : "local";
  },
  get embeddingModel(): string {
    return process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  },
  providerKey(id: "openai" | "anthropic" | "gemini"): string | undefined {
    const map = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY" } as const;
    return process.env[map[id]] || undefined;
  },
};

export const POLICY_VERSION = "2026-10-privacy-v1";
