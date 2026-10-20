import { compByKey, DIMENSIONS, type DimensionKey } from "../interview/catalog";
import { tokenize } from "../resume/embed";
import type {
  AnswerEvaluation, EvaluationContext, FeedbackContext, FeedbackSummary, FollowUp, FollowUpContext, GenerateRequest,
  GenerateResult, GeneratedQuestion, HealthResult, LlmProvider, QuestionContext,
} from "./types";

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);
const splitSentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const count = (t: string, re: RegExp) => (t.match(re) ?? []).length;
const band = (n: number, cuts: number[]) => 1 + cuts.filter((c) => n >= c).length; // cuts ascending -> 1..cuts.length+1

/** Picks the resume line that best matches the competency/focus keywords. The returned text is always verbatim from the chunk. */
export function pickEvidenceLine(text: string, keywords: string[]): string {
  const kw = new Set(keywords.flatMap((k) => tokenize(k)));
  const lines = text.split("\n").map((l) => l.replace(/^[\s•*\-–·]+/, "").trim()).filter((l) => l.length >= 25);
  if (!lines.length) return trunc(text.replace(/\s+/g, " ").trim(), 160);
  let best = lines[0];
  let bestScore = -1;
  for (const l of lines) {
    const s = tokenize(l).filter((t) => kw.has(t)).length;
    if (s > bestScore) {
      best = l;
      bestScore = s;
    }
  }
  return trunc(best, 160);
}

export const RE = {
  numbers: /\b\d[\d,.]*\s?(%|x|ms|k|m|million|thousand|percent)?/gi,
  examples: /\b(for example|for instance|such as|e\.g\.|one time|in 20\d\d|when i|at [A-Z][a-z]+)\b/gi,
  reasoning: /\b(because|therefore|so that|trade-?offs?|instead of|rather than|since|due to|decided|chose|which meant|as a result|alternatively|considered)\b/gi,
  action: /\bi (built|wrote|designed|led|implemented|fixed|measured|tested|investigated|proposed|reviewed|migrated|reduced|improved|created|introduced|owned|shipped)\b/gi,
  problem: /\b(root cause|hypothes\w+|reproduc\w+|profil\w+|measur\w+|benchmark\w*|experiment\w*|iterat\w+|narrowed|isolated|rolled back|monitor\w*)\b/gi,
  structure: /\b(first|second|then|next|finally|situation|task|action|result|overall|in summary)\b/gi,
};

/**
 * Deterministic, transparent heuristic scorer used by the mock provider. It looks only at the words of the answer
 * and the question. It does not look at speech confidence, accent, camera, or integrity events, and it says so.
 */
export function heuristicEvaluate(ctx: EvaluationContext): AnswerEvaluation {
  const answer = ctx.answer.trim();
  const words = answer.split(/\s+/).filter(Boolean).length;
  const sentences = splitSentences(answer);
  const comp = compByKey(ctx.competencyKey);
  const qSet = new Set([...tokenize(ctx.question), ...comp.keywords.flatMap((k) => tokenize(k))]);
  const aTokens = new Set(tokenize(answer));
  let overlap = 0;
  for (const t of aTokens) if (qSet.has(t)) overlap++;
  const ratio = overlap / Math.max(4, Math.min(qSet.size, 12));

  const nums = count(answer, RE.numbers);
  const exs = count(answer, RE.examples);
  const proper = new Set((answer.match(/(?<![.!?]\s)(?<!^)\b[A-Z][A-Za-z0-9+#.]{2,}\b/g) ?? []).map((s) => s.toLowerCase())).size;
  const reasons = count(answer, RE.reasoning);
  const solve = count(answer, RE.problem) + count(answer, RE.action);
  const struct = count(answer, RE.structure);
  const avgLen = sentences.length ? words / sentences.length : 0;

  const raw: Record<DimensionKey, { score: number | null; note: string }> = {
    relevance: { score: band(ratio, [0.15, 0.3, 0.5, 0.7]), note: `${overlap} terms in the answer match the question or competency.` },
    accuracy: { score: null, note: "Not assessed in demo mode. Correctness needs a capable model or a human reviewer." },
    reasoning: { score: band(reasons, [1, 2, 3, 5]), note: `${reasons} explanatory phrases (for example "because", "instead of").` },
    specificity: { score: band(Math.min(nums, 3) + Math.min(exs, 2) + Math.min(proper, 3), [2, 3, 5, 7]), note: `${nums} numbers, ${exs} example markers, ${proper} named items.` },
    problem_solving: { score: band(solve, [1, 2, 3, 5]), note: `${solve} signals of investigation or action.` },
    clarity: {
      score: Math.min(5, 1 + (sentences.length >= 2 ? 1 : 0) + (sentences.length >= 4 ? 1 : 0) + (struct >= 2 ? 1 : 0) + (avgLen >= 8 && avgLen <= 30 ? 1 : 0)),
      note: `${sentences.length} sentences with ${struct} sequencing words. Judged from the text only.`,
    },
  };

  const dims = ctx.dimensionKeys.map((k) => ({ key: k, score: raw[k].score, note: raw[k].note }));
  const scored = dims.filter((d) => d.score !== null) as { key: DimensionKey; score: number; note: string }[];
  let overall = scored.length ? scored.reduce((a, d) => a + d.score, 0) / scored.length : 1;
  if (words < 15) overall = Math.min(overall, 2);
  else if (words < 30) overall = Math.min(overall, 3);
  overall = Math.max(1, Math.min(5, Math.round(overall * 2) / 2));

  const excerpts: { quote: string; supports: string }[] = [];
  for (const s of sentences) {
    if (excerpts.length >= 3) break;
    if (new RegExp(RE.reasoning.source, "i").test(s)) excerpts.push({ quote: trunc(s, 240), supports: "Explains a reason or trade-off" });
    else if (/\d/.test(s)) excerpts.push({ quote: trunc(s, 240), supports: "Gives a specific or measurable detail" });
    else if (new RegExp(RE.action.source, "i").test(s)) excerpts.push({ quote: trunc(s, 240), supports: "Describes a personal action" });
  }

  const missing: string[] = [];
  const suggestions: string[] = [];
  if (words < 30) {
    missing.push("The answer is brief, so there is little evidence to assess.");
    suggestions.push("Aim for 45 to 90 seconds: set the context, say what you did, then describe the result.");
  }
  if ((raw.specificity.score ?? 0) <= 2) {
    missing.push("No concrete example, named tool or number was given.");
    suggestions.push("Name one specific project, tool or situation so the listener can picture it.");
  }
  if ((raw.reasoning.score ?? 0) <= 2) {
    missing.push("The answer does not explain why this approach was chosen.");
    suggestions.push("Say what alternatives you considered and why you picked this one.");
  }
  if (nums === 0 && ["ownership", "technical_depth", "problem_solving"].includes(ctx.competencyKey)) {
    missing.push("No measurable outcome was mentioned.");
    suggestions.push("Close with the result: a number, a before-and-after, or how you knew it worked.");
  }

  const strong = scored.filter((d) => d.score >= 4).map((d) => DIMENSIONS[d.key].name.toLowerCase());
  const weak = scored.filter((d) => d.score <= 2).map((d) => DIMENSIONS[d.key].name.toLowerCase());
  const explanation =
    `Demo heuristic rating of ${overall}/5 for "${comp.name}". ` +
    (strong.length ? `The answer shows evidence of ${strong.join(", ")}. ` : "") +
    (weak.length ? `Evidence was thin for ${weak.join(", ")}. ` : "") +
    "This is a keyword-based estimate, not a judgement of the candidate.";

  return {
    overallScore: overall,
    dimensions: dims,
    explanation,
    excerpts,
    missingEvidence: missing.slice(0, 5),
    suggestions: suggestions.slice(0, 3),
    uncertainty: "Demo mode scores wording patterns only. It cannot verify facts or judge quality of ideas. Treat as a practice signal and use human review for decisions.",
  };
}

export class MockProvider implements LlmProvider {
  readonly id = "mock" as const;
  readonly model = "mock-deterministic-1";
  readonly capabilities = { streaming: true, structuredOutput: "deterministic" as const, sendsDataExternally: false };

  async generateResponse(req: GenerateRequest): Promise<GenerateResult> {
    return { text: `[demo] ${trunc(req.user.replace(/\s+/g, " "), 200)}`, model: this.model, inputTokens: Math.ceil(req.user.length / 4), outputTokens: 20 };
  }

  async *streamResponse(req: GenerateRequest): AsyncIterable<string> {
    const { text } = await this.generateResponse(req);
    for (const w of text.split(/(\s+)/)) yield w;
  }

  async generateInterviewQuestion(ctx: QuestionContext): Promise<GeneratedQuestion> {
    const comp = compByKey(ctx.competencyKey);
    const prompt = comp.prompts[ctx.difficulty];
    const focus = ctx.focus[0];
    const usable = ctx.evidence.filter((e) => e.text.trim());
    if (ctx.resumeAttached && usable.length) {
      const ev = usable[0];
      const line = pickEvidenceLine(ev.text, [...comp.keywords, ...ctx.focus]);
      return {
        text: `Your resume says: “${line}”. ${prompt}`,
        competencyKey: comp.key,
        rationale: `Grounded in the ${ev.section} section of the resume and the ${comp.name.toLowerCase()} competency.`,
        evidenceChunkIds: [ev.id],
        needsClarification: false,
      };
    }
    if (ctx.resumeAttached) {
      const topic = focus ?? comp.name.toLowerCase();
      return {
        text: `I don't see anything about ${topic} on your resume. If you have relevant experience, describe it; if not, tell me about the closest experience you do have. ${prompt}`,
        competencyKey: comp.key,
        rationale: "No resume evidence was found for this area, so the interviewer asks instead of assuming.",
        evidenceChunkIds: [],
        needsClarification: true,
      };
    }
    return {
      text: `For the ${ctx.roleTitle} role: ${prompt}`,
      competencyKey: comp.key,
      rationale: `No resume was attached, so this question targets the ${comp.name.toLowerCase()} competency directly.`,
      evidenceChunkIds: [],
      needsClarification: false,
    };
  }

  async generateFollowUp(ctx: FollowUpContext): Promise<FollowUp | null> {
    const m = ctx.missingEvidence.join(" ").toLowerCase();
    if (!m) return null;
    if (m.includes("measurable")) return { text: "What was the measurable result of that, and how did you know it worked?", rationale: "The answer did not state an outcome." };
    if (m.includes("why")) return { text: "Why did you choose that approach over the alternatives you considered?", rationale: "The answer did not explain the decision." };
    if (m.includes("concrete")) return { text: "Can you give one specific example, including the tools or situation involved?", rationale: "The answer stayed general." };
    return { text: "Could you say a little more about that? For example, what you did and what happened as a result.", rationale: "The answer was brief." };
  }

  async evaluateAnswer(ctx: EvaluationContext): Promise<AnswerEvaluation> {
    return heuristicEvaluate(ctx);
  }

  async generateFeedback(ctx: FeedbackContext): Promise<FeedbackSummary> {
    const scored = ctx.competencies.filter((c) => c.score !== null) as { key: string; name: string; score: number }[];
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    const top = sorted[0];
    const low = sorted[sorted.length - 1];
    const summary =
      `You answered ${ctx.answered} of ${ctx.total} questions for the ${ctx.roleTitle} interview. ` +
      (ctx.overall !== null ? `The demo heuristic rating is ${ctx.overall.toFixed(1)} out of 5. ` : "There were not enough answers to rate. ") +
      (top && low && top.key !== low.key ? `Evidence was strongest for ${top.name.toLowerCase()} and thinnest for ${low.name.toLowerCase()}. ` : "") +
      "These are practice signals from keyword heuristics; a human reviewer should make any decision.";
    const targets = (sorted.length ? sorted.slice(-2).reverse() : []).map((c) => compByKey(c.key));
    const practice = (targets.length ? targets : [compByKey("problem_solving"), compByKey("ownership")]).map((c) => c.prompts.medium);
    return { summary, practiceQuestions: practice.slice(0, 4) };
  }

  async healthCheck(): Promise<HealthResult> {
    return { ok: true, status: "ok", latencyMs: 0, message: "Built-in demo provider. No network or credentials needed." };
  }
}
