import { q, uid } from "./db";

export type Actor = { id: string | null; role: string | null };

export function audit(actor: Actor, action: string, target?: { type: string; id?: string }, metadata: Record<string, unknown> = {}) {
  q.run(
    "INSERT INTO audit_events (id, actor_id, actor_role, action, target_type, target_id, metadata_json) VALUES (?,?,?,?,?,?,?)",
    uid(),
    actor.id,
    actor.role,
    action,
    target?.type ?? null,
    target?.id ?? null,
    JSON.stringify(redact(metadata)),
  );
}

// Audit metadata must never carry secrets or resume/transcript content.
const SENSITIVE = /key|secret|token|password|text|transcript|content/i;
function redact(m: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : v]));
}
