import { z } from "zod";
import { route } from "@/server/http";
import { checkProvider } from "@/server/ai/router";
import { notFound } from "@/server/errors";

export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = route<{ id: string }>({ roles: ["admin"], limit: [20, 60_000] }, async ({ params }) => {
  const id = z.enum(["mock", "openai", "anthropic", "gemini"]).safeParse(params.id);
  if (!id.success) throw notFound("Unknown provider.");
  return checkProvider(id.data);
});
