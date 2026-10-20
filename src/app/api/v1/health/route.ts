import { route } from "@/server/http";
import { getDb } from "@/server/db";
import { env } from "@/server/env";

export const runtime = "nodejs";
export const GET = route({ public: true }, async () => { getDb().prepare("SELECT 1").get(); return { ok: true, demoMode: env.demoMode }; });
