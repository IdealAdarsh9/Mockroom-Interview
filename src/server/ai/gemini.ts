import { BaseModelProvider, httpError, networkError, sseData } from "./base";
import type { GenerateRequest, GenerateResult } from "./types";

export class GeminiProvider extends BaseModelProvider {
  readonly id = "gemini" as const;
  readonly label = "Google Gemini";
  readonly capabilities = { streaming: true, structuredOutput: "native" as const, sendsDataExternally: true };

  private base() {
    return this.cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  }
  // The key travels in a header, not the URL, so it cannot end up in access logs.
  private headers() {
    return { "content-type": "application/json", "x-goog-api-key": this.requireKey() };
  }
  private body(req: GenerateRequest) {
    return JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      // Gemini 2.5+ models spend part of maxOutputTokens on internal "thinking" before writing the answer, so the
      // visible reply can come back empty or cut off. Leave generous headroom above what the answer itself needs.
      generationConfig: { maxOutputTokens: Math.min(8192, Math.max(2048, (req.maxTokens ?? 800) * 5)), ...(req.json ? { responseMimeType: "application/json" } : {}) },
    });
  }

  protected async call(req: GenerateRequest): Promise<GenerateResult> {
    let res: Response;
    try {
      res = await fetch(`${this.base()}/models/${encodeURIComponent(this.cfg.model)}:generateContent`, {
        method: "POST", headers: this.headers(), body: this.body(req), signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (e) {
      throw networkError(this.id, this.label, e);
    }
    if (!res.ok) throw httpError(this.id, this.label, res.status, res.headers.get("retry-after"));
    const data = (await res.json()) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]; promptFeedback?: { blockReason?: string }; usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number } };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim() || data.candidates?.[0]?.finishReason === "MAX_TOKENS") {
      // Diagnostic only: reasons and lengths, never prompt or candidate content.
      console.warn(`[gemini] unusable reply: finishReason=${data.candidates?.[0]?.finishReason ?? "none"} blockReason=${data.promptFeedback?.blockReason ?? "none"} textChars=${text.length}`);
    }
    return {
      text,
      model: this.cfg.model,
      inputTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    };
  }

  async *streamResponse(req: GenerateRequest): AsyncIterable<string> {
    let res: Response;
    try {
      res = await fetch(`${this.base()}/models/${encodeURIComponent(this.cfg.model)}:streamGenerateContent?alt=sse`, {
        method: "POST", headers: this.headers(), body: this.body(req), signal: AbortSignal.timeout(this.cfg.timeoutMs * 3),
      });
    } catch (e) {
      throw networkError(this.id, this.label, e);
    }
    if (!res.ok) throw httpError(this.id, this.label, res.status, res.headers.get("retry-after"));
    for await (const d of sseData(res)) {
      try {
        const t = JSON.parse(d).candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
        if (t) yield t as string;
      } catch {
        /* ignore */
      }
    }
  }
}
