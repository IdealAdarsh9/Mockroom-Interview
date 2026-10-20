import { route } from "@/server/http";
import { q } from "@/server/db";

export const runtime = "nodejs";
export const GET = route({ roles: ["admin"] }, async () => ({
  byProvider: q.all("SELECT provider_id AS provider, operation, COUNT(*) AS requests, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures, ROUND(AVG(latency_ms)) AS avgLatencyMs, COALESCE(SUM(input_tokens),0) AS inputTokens, COALESCE(SUM(output_tokens),0) AS outputTokens FROM usage_records GROUP BY provider_id, operation ORDER BY requests DESC"),
  recent: q.all("SELECT provider_id AS provider, operation, model, latency_ms AS latencyMs, success, error_code AS errorCode, created_at AS createdAt FROM usage_records ORDER BY created_at DESC LIMIT 25"),
  totals: q.get("SELECT COUNT(*) AS requests, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures FROM usage_records"),
}));
