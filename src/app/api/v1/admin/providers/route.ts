import { route } from "@/server/http";
import { listProviders } from "@/server/ai/router";

export const runtime = "nodejs";
export const GET = route({ roles: ["admin"] }, async () => ({ providers: listProviders() }));
