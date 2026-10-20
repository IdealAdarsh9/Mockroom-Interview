import { conflict } from "../errors";

export type Status = "CREATED" | "PREPARING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED" | "FAILED";

const TRANSITIONS: Record<Status, readonly Status[]> = {
  CREATED: ["PREPARING", "CANCELLED"],
  PREPARING: ["IN_PROGRESS", "FAILED", "CANCELLED"],
  IN_PROGRESS: ["PAUSED", "COMPLETED", "FAILED", "CANCELLED"],
  PAUSED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  // A recoverable failure can retry preparation (no question yet) or resume the interview (questions exist).
  FAILED: ["PREPARING", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const canTransition = (from: Status, to: Status) => TRANSITIONS[from]?.includes(to) ?? false;
export const isTerminal = (s: Status) => s === "COMPLETED" || s === "CANCELLED";
export const nextStates = (s: Status) => TRANSITIONS[s];

export function assertTransition(from: Status, to: Status) {
  if (!canTransition(from, to)) throw conflict(`This interview is ${from.toLowerCase().replace("_", " ")} and cannot move to ${to.toLowerCase().replace("_", " ")}.`, "invalid_transition");
}
