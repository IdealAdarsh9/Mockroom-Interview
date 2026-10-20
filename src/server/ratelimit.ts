import { tooMany } from "./errors";

type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { __rl?: Map<string, Bucket> };
const buckets = (g.__rl ??= new Map());

/** Fixed-window limiter. Process-local: swap for Redis when running more than one instance. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  if (process.env.RATE_LIMIT_DISABLED === "1") return;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > limit) throw tooMany(Math.ceil((b.resetAt - now) / 1000));
}

export function resetRateLimits() {
  buckets.clear();
}
