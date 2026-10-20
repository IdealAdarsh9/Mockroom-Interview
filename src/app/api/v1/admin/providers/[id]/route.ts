import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { providerUpdateSchema } from "@/server/schemas";
import { listProviders, updateProvider } from "@/server/ai/router";
import { notFound } from "@/server/errors";

export const runtime = "nodejs";
const ids = z.enum(["mock", "openai", "anthropic", "gemini"]);
export const PATCH = route<{ id: string }>({ roles: ["admin"], limit: [60, 60_000] }, async ({ req, user, params }) => {
  const id = ids.safeParse(params.id);
  if (!id.success) throw notFound("Unknown provider.");
  updateProvider({ id: user.id, role: user.role }, id.data, await parseJson(req, providerUpdateSchema));
  return { provider: listProviders().find((p) => p.id === id.data) }; // never includes the key itself
});
