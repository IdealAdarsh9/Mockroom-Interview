import { route } from "@/server/http";
import { q } from "@/server/db";

export const runtime = "nodejs";
export const GET = route({ roles: ["admin"] }, async ({ req }) => {
  const action = req.nextUrl.searchParams.get("action");
  const rows = q.all("SELECT id, actor_id AS actorId, actor_role AS actorRole, action, target_type AS targetType, target_id AS targetId, metadata_json AS metadata, created_at AS createdAt FROM audit_events " + (action ? "WHERE action LIKE ? " : "") + "ORDER BY created_at DESC LIMIT 200", ...(action ? [`${action.replace(/[%_]/g, "")}%`] : []));
  return { events: rows };
});
