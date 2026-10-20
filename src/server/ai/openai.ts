import { BaseModelProvider, httpError, networkError, sseData } from "./base";
import type { GenerateRequest, GenerateResult } from "./types";

export class OpenAIProvider extends BaseModelProvider {
  readonly id = "openai" as const;
  readonly label = "OpenAI";
  readonly capabilities = { streaming: true, structuredOutput: "native" as const, sendsDataExternally: true };

  private body(req: GenerateRequest, stream: boolean) {
    return JSON.stringify({
      model: this.cfg.model,
      messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
      max_completion_tokens: req.maxTokens ?? 800,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
      ...(stream ? { stream: true } : {}),
    });
  }
  private url() {
    return `${this.cfg.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`;
  }
  private headers() {
    return { "content-type": "application/json", authorization: `Bearer ${this.requireKey()}` };
  }

  protected async call(req: GenerateRequest): Promise<GenerateResult> {
    let res: Response;
    try {
      res = await fetch(this.url(), { method: "POST", headers: this.headers(), body: this.body(req, false), signal: AbortSignal.timeout(this.cfg.timeoutMs) });
    } catch (e) {
      throw networkError(this.id, this.label, e);
    }
    if (!res.ok) throw httpError(this.id, this.label, res.status, res.headers.get("retry-after"));
    const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
    return { text: data.choices?.[0]?.message?.content ?? "", model: this.cfg.model, inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens };
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
      if (d === "[DONE]") return;
      try {
        const delta = JSON.parse(d).choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch {
        /* ignore keep-alives */
      }
    }
  }
}
