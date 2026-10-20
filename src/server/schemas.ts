import { z } from "zod";
import { ALL_EVENT_TYPES } from "./interview/events";

export const registerSchema = z.object({ name: z.string().trim().min(1, "Enter your name.").max(80), email: z.string().trim().email("Enter a valid email address.").max(200), password: z.string().min(1).max(200) });
export const loginSchema = z.object({ email: z.string().trim().email("Enter a valid email address.").max(200), password: z.string().min(1, "Enter your password.").max(200) });
export const profileSchema = z.object({
  headline: z.string().trim().max(120).nullish(), targetRole: z.string().trim().max(120).nullish(),
  experienceLevel: z.enum(["entry", "mid", "senior", "lead"]).nullish(), accommodationsNote: z.string().trim().max(500).nullish(), prefersTextMode: z.boolean().optional(),
});
export const createInterviewSchema = z.object({
  roleId: z.string().max(100).nullish(), roleTitle: z.string().trim().max(120).optional(), jobDescription: z.string().trim().max(6000).optional(),
  interviewType: z.enum(["behavioral", "technical", "system_design", "mixed"]), difficulty: z.enum(["easy", "medium", "hard"]),
  durationMin: z.number().int().min(8).max(45), focus: z.array(z.string().max(60)).max(6).default([]),
  resumeId: z.string().max(100).nullish(), answerMode: z.enum(["voice", "text"]), shareOrgId: z.string().max(100).nullish(),
  monitoring: z.object({ enabled: z.boolean(), visibility: z.boolean(), focus: z.boolean(), connection: z.boolean(), clipboard: z.boolean(), fullscreen: z.boolean() }).partial().optional(),
});
export const consentSchema = z.object({ items: z.array(z.object({ type: z.enum(["ai_processing", "microphone", "camera", "video_diagnostics", "integrity_monitoring", "share_with_org"]), granted: z.boolean() })).min(1).max(8) });
export const answerSchema = z.object({
  questionId: z.string().min(1).max(100), text: z.string().max(8000).default(""), originalText: z.string().max(8000).optional(),
  source: z.enum(["text", "speech"]), durationMs: z.number().int().min(0).max(3_600_000).optional(), skipped: z.boolean().optional(),
});
export const correctionSchema = z.object({ text: z.string().trim().min(1, "Corrected text cannot be empty.").max(8000) });
export const eventSchema = z.object({ type: z.enum(ALL_EVENT_TYPES), occurredAt: z.string().max(40).optional(), durationMs: z.number().int().min(0).max(86_400_000).optional(), metadata: z.object({ chars: z.number().int().min(0).max(1_000_000).optional() }).optional() });
export const contestSchema = z.object({ note: z.string().trim().min(1, "Add a short note.").max(500) });
export const shareSchema = z.object({ share: z.boolean() });
export const searchSchema = z.object({ query: z.string().trim().min(2).max(300), k: z.number().int().min(1).max(10).optional() });
export const providerUpdateSchema = z.object({
  enabled: z.boolean().optional(), model: z.string().max(100).optional(), apiKey: z.string().max(400).nullable().optional(), isDefault: z.boolean().optional(),
  isFallback: z.boolean().optional(), candidateDataOk: z.boolean().optional(), baseUrl: z.string().max(300).nullable().optional(), timeoutMs: z.number().int().optional(),
});
export const settingsSchema = z.object({
  retention: z.object({ resumeDays: z.number().int().min(1).max(3650), transcriptDays: z.number().int().min(1).max(3650), derivedDays: z.number().int().min(1).max(3650) }),
  monitoringDefaults: z.object({ visibility: z.boolean(), focus: z.boolean(), connection: z.boolean(), clipboard: z.boolean(), fullscreen: z.boolean() }),
  humanReviewRequired: z.boolean(),
});
export const reviewSchema = z.object({ score: z.number().min(1).max(5).nullable(), note: z.string().trim().max(600).default("") });
