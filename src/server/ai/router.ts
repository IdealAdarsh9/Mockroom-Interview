import { q, uid } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import { env } from "../env";
import { audit, type Actor } from "../audit";
import { badRequest, notFound } from "../errors";
import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { ProviderError, type HealthResult, type LlmProvider, type ProviderId } from "./types";

type Row = {
  id: ProviderId; display_name: string; enabled: number; model: string; api_key_enc: string | null; is_default: number;
  is_fallback: number; candidate_data_ok: number; base_url: string | null; timeout_ms: number; updated_at: string;
};

const DEFAULTS: { id: ProviderId; name: string; model: string }[] = [
  { id: "mock", name: "Demo provider (built in)", model: "mock-deterministic-1" },
  { id: "openai", name: "OpenAI", model: "gpt-4o-mini" },
  { id: "anthropic", name: "Anthropic", model: "claude-sonnet-5-5" },
  { id: "gemini", name: "Google Gemini", model: "gemini-2.0-flash" },
];

export function ensureProviders() {
  for (const d of DEFAULTS) {
    q.run(
      "INSERT OR IGNORE INTO provider_configurations (id, display_name, enabled, model, is_default, candidate_data_ok) VALUES (?,?,?,?,?,?)",
      d.id, d.name, d.id === "mock" ? 1 : 0, d.model, d.id === "mock" ? 1 : 0, d.id === "mock" ? 1 : 0,
    );
  }
}

const row = (id: ProviderId) => {
  ensureProviders();
  const r = q.get<Row>("SELECT * FROM provider_configurations WHERE id = ?", id);
  if (!r) throw notFound("Unknown provider.");
  return r;
};

function resolveKey(r: Row): { key?: string; source: "stored" | "env" | "none" } {
  if (r.id === "mock") return { source: "none" };
  if (r.api_key_enc) {
    const k = decryptSecret(r.api_key_enc);
    if (k) return { key: k, source: "stored" };
  }
  const e = env.providerKey(r.id as "openai" | "anthropic" | "gemini");
  return e ? { key: e, source: "env" } : { source: "none" };
}

export function buildProvider(id: ProviderId): LlmProvider {
  const r = row(id);
  if (id === "mock") return new MockProvider();
  const cfg = { apiKey: resolveKey(r).key, model: r.model, baseUrl: r.base_url ?? undefined, timeoutMs: r.timeout_ms };
  return id === "openai" ? new OpenAIProvider(cfg) : id === "anthropic" ? new AnthropicProvider(cfg) : new GeminiProvider(cfg);
}

export const defaultProviderId = (): ProviderId => {
  ensureProviders();
  return (q.get<{ id: ProviderId }>("SELECT id FROM provider_configurations WHERE is_default = 1 AND enabled = 1")?.id ?? "mock") as ProviderId;
};

export const isExternal = (id: ProviderId) => id !== "mock";

function logUsage(p: { providerId: ProviderId; operation: string; model?: string; latencyMs: number; ok: boolean; errorCode?: string; sessionId?: string; inTok?: number; outTok?: number }) {
  q.run(
    "INSERT INTO usage_records (id, provider_id, operation, model, latency_ms, input_tokens, output_tokens, success, error_code, session_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
    uid(), p.providerId, p.operation, p.model ?? null, p.latencyMs, p.inTok ?? null, p.outTok ?? null, p.ok ? 1 : 0, p.errorCode ?? null, p.sessionId ?? null,
  );
}

/** A provider may receive candidate data only if it is enabled, has a key, and an admin acknowledged data sharing. */
function usable(r: Row): ProviderError | null {
  if (!r.enabled) return new ProviderError(r.id, "not_configured", `${r.display_name} is disabled.`);
  if (r.id === "mock") return null;
  if (!resolveKey(r).key) return new ProviderError(r.id, "not_configured", `${r.display_name} has no API key configured.`);
  if (!r.candidate_data_ok) return new ProviderError(r.id, "not_permitted", `${r.display_name} is not approved to receive candidate data. An administrator must acknowledge data sharing first.`);
  return null;
}

export type AiRun<T> = { value: T; providerUsed: ProviderId; model: string; fellBackFrom?: ProviderId; fallbackReason?: string };

export async function runAI<T>(
  opts: { providerId: ProviderId; operation: string; sessionId?: string; needs?: "streaming" },
  fn: (p: LlmProvider) => Promise<T>,
): Promise<AiRun<T>> {
  const primary = row(opts.providerId);
  let failure = usable(primary);
  if (!failure) {
    const p = buildProvider(primary.id);
    const t0 = Date.now();
    try {
      const value = await fn(p);
      logUsage({ providerId: p.id, operation: opts.operation, model: p.model, latencyMs: Date.now() - t0, ok: true, sessionId: opts.sessionId });
      return { value, providerUsed: p.id, model: p.model };
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
      logUsage({ providerId: p.id, operation: opts.operation, model: p.model, latencyMs: Date.now() - t0, ok: false, errorCode: e.code, sessionId: opts.sessionId });
      failure = e;
    }
  }

  // Fallback is opt-in per provider and must itself be permitted to receive this data and support what is needed.
  const fb = q.get<Row>("SELECT * FROM provider_configurations WHERE is_fallback = 1 AND enabled = 1 AND id != ?", primary.id);
  if (fb && !usable(fb)) {
    const fp = buildProvider(fb.id);
    if (!(opts.needs === "streaming" && !fp.capabilities.streaming)) {
      const t0 = Date.now();
      try {
        const value = await fn(fp);
        logUsage({ providerId: fp.id, operation: opts.operation, model: fp.model, latencyMs: Date.now() - t0, ok: true, sessionId: opts.sessionId });
        audit({ id: null, role: "system" }, "ai.fallback", { type: "provider", id: fp.id }, { from: primary.id, to: fp.id, reason: failure.code, operation: opts.operation });
        return { value, providerUsed: fp.id, model: fp.model, fellBackFrom: primary.id, fallbackReason: failure.message };
      } catch (e) {
        if (!(e instanceof ProviderError)) throw e;
        logUsage({ providerId: fp.id, operation: opts.operation, model: fp.model, latencyMs: Date.now() - t0, ok: false, errorCode: e.code, sessionId: opts.sessionId });
      }
    }
  }
  throw failure;
}

export async function checkProvider(id: ProviderId): Promise<HealthResult> {
  const r = row(id);
  const p = buildProvider(id);
  const res = await p.healthCheck();
  logUsage({ providerId: id, operation: "healthCheck", model: r.model, latencyMs: res.latencyMs ?? 0, ok: res.ok, errorCode: res.ok ? undefined : res.status });
  return res;
}

export function listProviders() {
  ensureProviders();
  return q.all<Row>("SELECT * FROM provider_configurations ORDER BY CASE id WHEN 'mock' THEN 0 WHEN 'openai' THEN 1 WHEN 'anthropic' THEN 2 ELSE 3 END").map((r) => {
    const key = resolveKey(r);
    const stats = q.get<{ n: number; fails: number; avg: number | null }>(
      "SELECT COUNT(*) n, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) fails, AVG(latency_ms) avg FROM usage_records WHERE provider_id = ? AND created_at > datetime('now', '-7 days')",
      r.id,
    );
    const lastErr = q.get<{ error_code: string; created_at: string }>("SELECT error_code, created_at FROM usage_records WHERE provider_id = ? AND success = 0 ORDER BY created_at DESC LIMIT 1", r.id);
    const caps = buildProvider(r.id).capabilities;
    return {
      id: r.id, displayName: r.display_name, enabled: !!r.enabled, model: r.model,
      hasKey: key.source !== "none" || r.id === "mock", keySource: key.source,
      isDefault: !!r.is_default, isFallback: !!r.is_fallback, candidateDataOk: !!r.candidate_data_ok,
      baseUrl: r.base_url, timeoutMs: r.timeout_ms, capabilities: caps,
      metrics: { requests7d: stats?.n ?? 0, failures7d: stats?.fails ?? 0, avgLatencyMs: stats?.avg ? Math.round(stats.avg) : null, lastError: lastErr ?? null },
    };
  });
}

export type ProviderUpdate = {
  enabled?: boolean; model?: string; apiKey?: string | null; isDefault?: boolean; isFallback?: boolean;
  candidateDataOk?: boolean; baseUrl?: string | null; timeoutMs?: number;
};

function validBaseUrl(u: string) {
  let url: URL;
  try { url = new URL(u); } catch { throw badRequest("Base URL is not a valid URL.", "bad_base_url"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) throw badRequest("Base URL must use https (http is allowed only for localhost).", "bad_base_url");
}

export function updateProvider(actor: Actor, id: ProviderId, u: ProviderUpdate) {
  const r = row(id);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };

  if (u.model !== undefined) { if (!u.model.trim()) throw badRequest("Model name is required."); set("model", u.model.trim()); }
  if (u.baseUrl !== undefined) { if (u.baseUrl) validBaseUrl(u.baseUrl); set("base_url", u.baseUrl || null); }
  if (u.timeoutMs !== undefined) set("timeout_ms", Math.min(120000, Math.max(1000, u.timeoutMs)));
  if (u.apiKey !== undefined) {
    if (id === "mock") throw badRequest("The demo provider does not use an API key.");
    set("api_key_enc", u.apiKey ? encryptSecret(u.apiKey.trim()) : null);
  }
  if (u.candidateDataOk !== undefined) set("candidate_data_ok", u.candidateDataOk ? 1 : 0);
  if (u.enabled !== undefined) {
    if (!u.enabled && r.is_default) throw badRequest("Choose another default provider before disabling this one.", "is_default");
    set("enabled", u.enabled ? 1 : 0);
    if (!u.enabled && r.is_fallback) set("is_fallback", 0);
  }
  if (sets.length) q.run(`UPDATE provider_configurations SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...vals, new Date().toISOString(), id);

  if (u.isDefault) {
    const cur = row(id);
    if (!cur.enabled) throw badRequest("Enable the provider before making it the default.");
    q.run("UPDATE provider_configurations SET is_default = 0, is_fallback = CASE WHEN id = ? THEN 0 ELSE is_fallback END", id);
    q.run("UPDATE provider_configurations SET is_default = 1, is_fallback = 0 WHERE id = ?", id);
  }
  if (u.isFallback !== undefined) {
    if (u.isFallback) {
      const cur = row(id);
      if (!cur.enabled) throw badRequest("Enable the provider before using it as the fallback.");
      if (cur.is_default) throw badRequest("The default provider cannot also be the fallback.");
      q.run("UPDATE provider_configurations SET is_fallback = 0");
      q.run("UPDATE provider_configurations SET is_fallback = 1 WHERE id = ?", id);
    } else q.run("UPDATE provider_configurations SET is_fallback = 0 WHERE id = ?", id);
  }
  // Metadata only: the key itself is never written to the audit log.
  audit(actor, "provider.update", { type: "provider", id }, { fields: Object.keys(u), credentialUpdated: u.apiKey !== undefined });
}
