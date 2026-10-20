import { BaseModelProvider, httpError, networkError, sseData } from "./base";
import type { GenerateRequest, GenerateResult } from "./types";

export class AnthropicProvider extends BaseModelProvider {
  readonly id = "anthropic" as const;
  readonly label = "Anthropic";
  // No native JSON mode: structured output is requested in the prompt and validated at runtime.
  readonly capabilities = { streaming: true, structuredOutput: "prompted" as const, sendsDataExternally: true };

  private headers() {
    return { "content-type": "application/json", "x-api-key": this.requireKey(), "anthropic-version": "2023-06-01" };
  }
  private url() {
    return `${this.cfg.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;
  }
  private body(req: GenerateRequest, stream: boolean) {
    return JSON.stringify({
      model: this.cfg.model,
      max_tokens: req.maxTokens ?? 800,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      ...(stream ? { stream: true } : {}),
    });
  }

  protected async call(req: GenerateRequest): Promise<GenerateResult> {
    let res: Response;
    try {
      res = await fetch(this.url(), { method: "POST", headers: this.headers(), body: this.body(req, false), signal: AbortSignal.timeout(this.cfg.timeoutMs) });
    } catch (e) {
      throw networkError(this.id, this.label, e);
    }
    if (!res.ok) throw httpError(this.id, this.label, res.status, res.headers.get("retry-after"));
    const data = (await res.json()) as { content: { type: string; text?: string }[]; usage?: { input_tokens: number; output_tokens: number } };
    return {
      text: data.content?.filter((b) => b.type === "text").map((b) => b.text).join("") ?? "",
      model: this.cfg.model,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    };
  }

  async *streamResponse(req: GenerateRequest): AsyncIterable<string> {
    let res: Response;
    try {
      res = await fetch(this.url(), { method: "POST", headers: this.headers(), body: this.body(req, true), signal: AbortSignal.timeout(this.cfg.timeoutMs * 3) });
    } catch (e) {
      throw networkError(this.id, this.label, e);
    }
    if (!res.ok) throw httpError(this.id, this.label, res.status, res.headers.get("retry-after"));
    for await (const d of sseData(res)) {
      try {
        const ev = JSON.parse(d);
        if (ev.type === "content_block_delta" && ev.delta?.text) yield ev.delta.text as string;
      } catch {
        /* ignore */
      }
    }
  }
}
