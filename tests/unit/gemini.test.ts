import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../../src/server/ai/gemini";

const cfg = { apiKey: "test-key-not-real", model: "gemini-test", timeoutMs: 5000 };
afterEach(() => vi.unstubAllGlobals());

describe("Gemini adapter (stubbed network)", () => {
  it("leaves output-token headroom for thinking and parses a structured question", async () => {
    let sent: { generationConfig: { maxOutputTokens: number; responseMimeType?: string } } | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      const reply = { text: "Tell me about a time you led a migration and what you measured.", competencyKey: "ownership", rationale: "Résumé mentions a migration.", evidenceChunkIds: [] };
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: 200 });
    }));
    const q = await new GeminiProvider(cfg).generateInterviewQuestion({
      roleTitle: "Engineer", jobDescription: "Build things.", interviewType: "behavioral", difficulty: "medium", focus: [], previous: [], evidence: [],
    } as never);
    expect(q.competencyKey).toBe("ownership");
    expect(sent!.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(2048);
    expect(sent!.generationConfig.responseMimeType).toBe("application/json");
  });
  it("reports an empty/truncated reply as an unexpected-format provider error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }), { status: 200 })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(new GeminiProvider(cfg).generateInterviewQuestion({ roleTitle: "E", jobDescription: "x", interviewType: "behavioral", difficulty: "medium", focus: [], previous: [], evidence: [] } as never)).rejects.toThrow(/unexpected format/);
  });
});
