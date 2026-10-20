import { z } from "zod";
import type { Difficulty, DimensionKey, InterviewType } from "../interview/catalog";

export type ProviderId = "mock" | "openai" | "anthropic" | "gemini";

export type Capabilities = {
  streaming: boolean;
  structuredOutput: "native" | "prompted" | "deterministic";
  /** True when prompts leave this server. Drives consent text and the fallback policy. */
  sendsDataExternally: boolean;
};

export type EvidenceChunk = { id: string; section: string; text: string };

export type QuestionContext = {
  roleTitle: string;
  jobDescription: string;
  interviewType: InterviewType;
  difficulty: Difficulty;
  focus: string[];
  competencyKey: string;
  ordinal: number;
  maxQuestions: number;
  /** Retrieved resume evidence, already ranked. Empty when no resume is attached or nothing relevant was found. */
  evidence: EvidenceChunk[];
  resumeAttached: boolean;
  previous: { question: string; answer: string; competencyKey: string }[];
};

export type FollowUpContext = {
  roleTitle: string;
  question: string;
  answer: string;
  competencyKey: string;
  missingEvidence: string[];
};

export type EvaluationContext = {
  roleTitle: string;
  interviewType: InterviewType;
  question: string;
  competencyKey: string;
  answer: string;
  dimensionKeys: DimensionKey[];
  evidence: EvidenceChunk[];
};

export type FeedbackContext = {
  roleTitle: string;
  overall: number | null;
  competencies: { key: string; name: string; score: number | null }[];
  strengths: string[];
  gaps: string[];
  answered: number;
  total: number;
};

export type GenerateRequest = { system: string; user: string; maxTokens?: number; json?: boolean; temperature?: number };
export type GenerateResult = { text: string; inputTokens?: number; outputTokens?: number; model: string };

export const GeneratedQuestionSchema = z.object({
  text: z.string().min(10).max(500),
  competencyKey: z.string().min(1),
  rationale: z.string().max(400),
  evidenceChunkIds: z.array(z.string()).max(5),
  needsClarification: z.boolean().default(false), // tolerate providers that omit it
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export const FollowUpSchema = z.object({ text: z.string().min(10).max(400), rationale: z.string().max(300) });
export type FollowUp = z.infer<typeof FollowUpSchema>;

export const AnswerEvaluationSchema = z.object({
  overallScore: z.number().min(1).max(5),
  dimensions: z
    .array(
      z.object({
        key: z.enum(["relevance", "accuracy", "reasoning", "specificity", "problem_solving", "clarity"]),
        score: z.number().min(1).max(5).nullable(),
        note: z.string().max(400),
      }),
    )
    .min(1),
  explanation: z.string().min(1).max(900),
  excerpts: z.array(z.object({ quote: z.string().min(1).max(400), supports: z.string().max(200) })).max(4),
  missingEvidence: z.array(z.string().max(200)).max(6),
  suggestions: z.array(z.string().max(300)).max(4),
  uncertainty: z.string().max(400),
});
export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;

export const FeedbackSchema = z.object({
  summary: z.string().min(1).max(1200),
  practiceQuestions: z.array(z.string().max(300)).max(5),
});
export type FeedbackSummary = z.infer<typeof FeedbackSchema>;

export type HealthResult = { ok: boolean; status: "ok" | "not_configured" | "not_permitted" | "error"; latencyMs?: number; message: string };

export interface LlmProvider {
  readonly id: ProviderId;
  readonly model: string;
  readonly capabilities: Capabilities;
  generateResponse(req: GenerateRequest): Promise<GenerateResult>;
  streamResponse(req: GenerateRequest): AsyncIterable<string>;
  generateInterviewQuestion(ctx: QuestionContext): Promise<GeneratedQuestion>;
  generateFollowUp(ctx: FollowUpContext): Promise<FollowUp | null>;
  evaluateAnswer(ctx: EvaluationContext): Promise<AnswerEvaluation>;
  generateFeedback(ctx: FeedbackContext): Promise<FeedbackSummary>;
  healthCheck(): Promise<HealthResult>;
}

export class ProviderError extends Error {
  constructor(
    public providerId: ProviderId,
    public code: "timeout" | "rate_limited" | "auth" | "server" | "network" | "invalid_output" | "bad_request" | "not_configured" | "not_permitted",
    message: string,
    public retryable = false,
    public status?: number,
  ) {
    super(message);
  }
}
