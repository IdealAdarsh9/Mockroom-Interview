import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { getTextToSpeech } from "@/server/speech";

export const runtime = "nodejs";
export const POST = route({ roles: ["candidate"], limit: [60, 60_000] }, async ({ req }) => {
  const b = await parseJson(req, z.object({ text: z.string().min(1).max(600), rate: z.number().min(0.5).max(2).optional() }));
  const out = await getTextToSpeech().synthesize(b.text, { rate: b.rate });
  return new Response(new Uint8Array(out.audio), { headers: { "Content-Type": out.mime, "Cache-Control": "no-store", "X-Speech-Provider": "mock-tts" } });
});
