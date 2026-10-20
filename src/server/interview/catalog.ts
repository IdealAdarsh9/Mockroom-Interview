import { q, uid } from "../db";

export type InterviewType = "behavioral" | "technical" | "system_design" | "mixed";
export type Difficulty = "easy" | "medium" | "hard";

export const DIMENSIONS = {
  relevance: { name: "Relevance", help: "Does the answer address what was asked?" },
  accuracy: { name: "Technical or domain accuracy", help: "Are the claims correct for the domain? Only assessed when a reviewer or capable model can verify it." },
  reasoning: { name: "Reasoning", help: "Does the answer explain why decisions were made, including trade-offs?" },
  specificity: { name: "Specificity and examples", help: "Does it use concrete examples, named tools, numbers or outcomes?" },
  problem_solving: { name: "Problem-solving approach", help: "Does it show how the problem was framed, tested and resolved?" },
  clarity: { name: "Organization of the answer", help: "Is the content structured so a listener can follow it? Judged from the words only, never accent or delivery." },
} as const;
export type DimensionKey = keyof typeof DIMENSIONS;

export const SCORE_ANCHORS: Record<number, string> = {
  1: "Does not address the question, or offers no usable evidence.",
  2: "Partly relevant, but general and unsupported.",
  3: "Addresses the question with some support; gaps remain.",
  4: "Clear, well-supported, with specific examples or reasoning.",
  5: "Complete and precise, with strong evidence and explicit trade-offs.",
};

export type Competency = { key: string; name: string; description: string; keywords: string[]; prompts: Record<Difficulty, string> };

export const COMPETENCIES: Competency[] = [
  {
    key: "problem_solving",
    name: "Problem solving",
    description: "Frames ambiguous problems, tests hypotheses and reaches a result.",
    keywords: ["problem", "debug", "root", "cause", "hypothesis", "solved", "fixed", "investigated", "approach", "tested", "measured"],
    prompts: {
      easy: "Tell me about a problem you solved and how you approached it.",
      medium: "Walk me through how you diagnosed it, which options you considered and why you chose your approach.",
      hard: "Take me through the hardest trade-off in solving it: what you ruled out, what you measured, and what you would change now.",
    },
  },
  {
    key: "technical_depth",
    name: "Technical depth",
    description: "Understands the tools and systems they use well enough to explain how and why they work.",
    keywords: ["architecture", "performance", "latency", "database", "api", "service", "testing", "deploy", "scale", "design", "implementation", "typescript", "python", "react", "sql", "cloud"],
    prompts: {
      easy: "Describe the technical design of that work in simple terms.",
      medium: "Explain how it works under the hood and why you chose those technologies over alternatives.",
      hard: "Explain the failure modes of that design, how you would detect them, and how it would behave at ten times the load.",
    },
  },
  {
    key: "ownership",
    name: "Ownership and impact",
    description: "Takes responsibility for outcomes and can show measurable results.",
    keywords: ["led", "owned", "delivered", "launched", "improved", "reduced", "increased", "shipped", "result", "impact", "responsible", "metric"],
    prompts: {
      easy: "What was your role in it and what was the outcome?",
      medium: "What did you personally own, what changed because of it, and how did you know it worked?",
      hard: "Where did it fall short of the goal, what did you do about it, and what would you do differently?",
    },
  },
  {
    key: "collaboration",
    name: "Collaboration",
    description: "Works with others, handles disagreement and communicates decisions.",
    keywords: ["team", "stakeholder", "colleague", "disagree", "feedback", "mentored", "aligned", "partnered", "review", "communicated"],
    prompts: {
      easy: "Who did you work with on it and how did you collaborate?",
      medium: "Describe a disagreement that came up while doing it and how it was resolved.",
      hard: "Describe a time you changed your mind because of someone else's input, and what that cost or saved the project.",
    },
  },
  {
    key: "system_design",
    name: "System design",
    description: "Breaks a large problem into components, states assumptions and weighs trade-offs.",
    keywords: ["component", "scalability", "consistency", "availability", "cache", "queue", "partition", "throughput", "bottleneck", "trade-off", "capacity", "storage"],
    prompts: {
      easy: "How would you design a simple version of a service like that?",
      medium: "How would you design it to handle growth, and which components would you add first?",
      hard: "Design it for high availability and strong consistency requirements. State your assumptions and the trade-offs you accept.",
    },
  },
  {
    key: "learning_agility",
    name: "Learning agility",
    description: "Picks up new domains quickly and applies lessons.",
    keywords: ["learned", "new", "ramped", "unfamiliar", "mistake", "retrospective", "improved", "course", "adopted", "experiment"],
    prompts: {
      easy: "Tell me about something new you had to learn for that work.",
      medium: "How did you get up to speed on something unfamiliar, and how did you check you had it right?",
      hard: "Describe a mistake you made while learning it, how you found out, and what changed afterwards.",
    },
  },
];

export const compByKey = (k: string) => COMPETENCIES.find((c) => c.key === k) ?? COMPETENCIES[0];

export type Template = {
  key: string;
  name: string;
  interviewType: InterviewType;
  description: string;
  competencyKeys: string[];
  dimensionKeys: DimensionKey[];
  defaultQuestions: number;
};

export const TEMPLATES: Template[] = [
  { key: "behavioral", name: "Behavioral", interviewType: "behavioral", description: "Experience-based questions about how you work with others and deliver results.", competencyKeys: ["ownership", "collaboration", "problem_solving", "learning_agility"], dimensionKeys: ["relevance", "specificity", "reasoning", "clarity"], defaultQuestions: 4 },
  { key: "technical", name: "Technical", interviewType: "technical", description: "Questions about the technology and decisions behind your projects.", competencyKeys: ["technical_depth", "problem_solving", "ownership", "learning_agility"], dimensionKeys: ["relevance", "accuracy", "reasoning", "specificity", "problem_solving"], defaultQuestions: 4 },
  { key: "system_design", name: "System design", interviewType: "system_design", description: "Design a system and explain the trade-offs.", competencyKeys: ["system_design", "technical_depth", "problem_solving"], dimensionKeys: ["relevance", "accuracy", "reasoning", "problem_solving", "clarity"], defaultQuestions: 3 },
  { key: "mixed", name: "Mixed loop", interviewType: "mixed", description: "A balanced mix of behavioral and technical questions.", competencyKeys: ["technical_depth", "ownership", "problem_solving", "collaboration", "system_design"], dimensionKeys: ["relevance", "accuracy", "reasoning", "specificity", "clarity"], defaultQuestions: 5 },
];

export const templateFor = (t: InterviewType) => TEMPLATES.find((x) => x.interviewType === t)!;

export const SAMPLE_ROLES = [
  { key: "sample-frontend", title: "Senior Frontend Engineer", level: "senior", description: "Own the customer-facing web application. Build accessible, performant interfaces in React and TypeScript, partner with design and product, mentor engineers and improve testing and performance across the codebase.", competencyKeys: ["technical_depth", "ownership", "collaboration", "problem_solving"] },
  { key: "sample-backend", title: "Backend Engineer", level: "mid", description: "Design and operate APIs and data pipelines. Work with PostgreSQL, queues and cloud infrastructure. Improve reliability, observability and latency of services used by many teams.", competencyKeys: ["technical_depth", "system_design", "problem_solving", "ownership"] },
  { key: "sample-pm", title: "Product Manager", level: "mid", description: "Define product strategy with engineering and design. Prioritise using customer evidence and metrics, communicate decisions to stakeholders and drive launches.", competencyKeys: ["ownership", "collaboration", "problem_solving", "learning_agility"] },
];

/** Idempotent. Mirrors the in-code catalog into the relational tables so reports and admin views can join on it. */
export function ensureCatalog() {
  for (const c of COMPETENCIES) {
    q.run(
      "INSERT OR IGNORE INTO competencies (id, key, name, description, keywords_json, anchors_json) VALUES (?,?,?,?,?,?)",
      uid(), c.key, c.name, c.description, JSON.stringify(c.keywords), JSON.stringify(SCORE_ANCHORS),
    );
  }
  for (const t of TEMPLATES) {
    q.run(
      "INSERT OR IGNORE INTO interview_templates (id, key, name, interview_type, description, competency_keys_json, default_questions) VALUES (?,?,?,?,?,?,?)",
      uid(), t.key, t.name, t.interviewType, t.description, JSON.stringify(t.competencyKeys), t.defaultQuestions,
    );
  }
  for (const r of SAMPLE_ROLES) {
    q.run(
      "INSERT OR IGNORE INTO job_roles (id, title, description, level, competency_keys_json, is_sample) SELECT ?,?,?,?,?,1 WHERE NOT EXISTS (SELECT 1 FROM job_roles WHERE is_sample = 1 AND title = ?)",
      `sample-${r.key}`, r.title, r.description, r.level, JSON.stringify(r.competencyKeys), r.title,
    );
  }
}
