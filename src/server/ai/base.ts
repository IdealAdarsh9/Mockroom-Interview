import { AnswerEvaluationSchema, FeedbackSchema, FollowUpSchema, GeneratedQuestionSchema, ProviderError } from "./types";
import type {
  AnswerEvaluation, Capabilities, EvaluationContext, FeedbackContext, FeedbackSummary, FollowUp, FollowUpContext,
  GenerateRequest, GenerateResult, GeneratedQuestion, HealthResult, LlmProvider, ProviderId, QuestionContext,
} from "./types";
import { evaluationPrompt, feedbackPrompt, followUpPrompt, questionPrompt } from "./prompts";
import type { ZodType } from "zod";

export type HttpConfig = { apiKey?: string; model: string; baseUrl?: string; timeoutMs: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bounded retry: only retryable failures, at most `retries` extra attempts, honours Retry-After up to 5 s. */
export async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseMs = 400): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ProviderError) || !e.retryable || attempt >= retries) throw e;
      const retryAfter = (e as ProviderError & { retryAfterMs?: number }).retryAfterMs;
      await sleep(Math.min(retryAfter ?? baseMs * 2 ** attempt, 5000));
      attempt++;
    }
  }
}

export function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/gim, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no json object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Reads a text/event-stream body and yields each `data:` payload. */
export async function* sseData(res: Response): AsyncIterable<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}

export function httpError(providerId: ProviderId, label: string, status: number, retryAfterHeader?: string | null): ProviderError {
  const retryAfterMs = retryAfterHeader && Number(retryAfterHeader) ? Number(retryAfterHeader) * 1000 : undefined;
  let err: ProviderError;
  if (status === 401 || status === 403) err = new ProviderError(providerId, "auth", `${label} rejected the API key (HTTP ${status}). Check the key and its permissions.`, false, status);
  else if (status === 429) err = new ProviderError(providerId, "rate_limited", `${label} is rate limiting requests (HTTP 429).`, true, status);
  else if (status >= 500) err = new ProviderError(providerId, "server", `${label} had a server error (HTTP ${status}).`, true, status);
  else err = new ProviderError(providerId, "bad_request", `${label} rejected the request (HTTP ${status}). Check the model name.`, false, status);
  (err as ProviderError & { retryAfterMs?: number }).retryAfterMs = retryAfterMs;
  return err;
}

export function networkError(providerId: ProviderId, label: string, e: unknown): ProviderError {
  const name = (e as Error)?.name;
  if (name === "TimeoutError" || name === "AbortError") return new ProviderError(providerId, "timeout", `${label} did not respond in time.`, true);
  return new ProviderError(providerId, "network", `Could not reach ${label}.`, true);
}

/** Shared structured-output plumbing. Subclasses supply only the raw model call. */
export abstract class BaseModelProvider implements LlmProvider {
  abstract readonly id: ProviderId;
  abstract readonly capabilities: Capabilities;
  abstract readonly label: string;
  constructor(protected cfg: HttpConfig) {}
  get model() {
    return this.cfg.model;
  }

  protected abstract call(req: GenerateRequest): Promise<GenerateResult>;
  abstract streamResponse(req: GenerateRequest): AsyncIterable<string>;

  protected requireKey(): string {
    if (!this.cfg.apiKey) throw new ProviderError(this.id, "not_configured", `${this.label} has no API key configured.`);
    return this.cfg.apiKey;
  }

  generateResponse(req: GenerateRequest) {
    return withRetry(() => this.call(req));
  }

  private async structured<T>(req: GenerateRequest, schema: ZodType<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await this.generateResponse({ ...req, json: true, user: attempt ? req.user + "\n\nYour previous reply was not valid JSON for the schema. Reply with the JSON object only." : req.user });
      try {
        return schema.parse(extractJson(r.text));
      } catch (e) {
        lastErr = e;
      }
    }
    void lastErr;
    throw new ProviderError(this.id, "invalid_output", `${this.label} returned an answer in an unexpected format.`);
  }

  async generateInterviewQuestion(ctx: QuestionContext): Promise<GeneratedQuestion> {
    const out = await this.structured({ ...questionPrompt(ctx), maxTokens: 400 }, GeneratedQuestionSchema);
    // Only accept evidence ids that were actually supplied; anything else is a hallucinated citation.
    const allowed = new Set(ctx.evidence.map((e) => e.id));
    return { ...out, evidenceChunkIds: out.evidenceChunkIds.filter((id) => allowed.has(id)) };
  }

  async generateFollowUp(ctx: FollowUpContext): Promise<FollowUp | null> {
    if (!ctx.missingEvidence.length) return null;
    return this.structured({ ...followUpPrompt(ctx), maxTokens: 250 }, FollowUpSchema);
  }

  async evaluateAnswer(ctx: EvaluationContext): Promise<AnswerEvaluation> {
    const out = await this.structured({ ...evaluationPrompt(ctx), maxTokens: 900 }, AnswerEvaluationSchema);
    const hay = ctx.answer.toLowerCase().replace(/\s+/g, " ");
    // Excerpts must be real quotes from the answer; drop anything the model made up.
    const excerpts = out.excerpts.filter((e) => hay.includes(e.quote.toLowerCase().replace(/\s+/g, " ").replace(/…$/, "").trim()));
    return { ...out, excerpts };
  }

  async generateFeedback(ctx: FeedbackContext): Promise<FeedbackSummary> {
    return this.structured({ ...feedbackPrompt(ctx), maxTokens: 700 }, FeedbackSchema);
  }

  async healthCheck(): Promise<HealthResult> {
    if (!this.cfg.apiKey) return { ok: false, status: "not_configured", message: `No API key configured for ${this.label}.` };
    const t0 = Date.now();
    try {
      await this.call({ system: "Reply with the word ok.", user: "ping", maxTokens: 8 });
      return { ok: true, status: "ok", latencyMs: Date.now() - t0, message: `${this.label} responded.` };
    } catch (e) {
      return { ok: false, status: "error", latencyMs: Date.now() - t0, message: e instanceof ProviderError ? e.message : `${this.label} check failed.` };
    }
  }
}
