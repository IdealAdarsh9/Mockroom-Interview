import { route } from "@/server/http";
import { retentionSweep } from "@/server/privacy";

export const runtime = "nodejs";
export const POST = route({ roles: ["admin"], limit: [5, 600_000] }, async ({ user }) => retentionSweep({ id: user.id, role: user.role }));
