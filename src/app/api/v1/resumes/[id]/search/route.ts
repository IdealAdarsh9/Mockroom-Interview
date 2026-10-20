import { route, parseJson } from "@/server/http";
import { searchSchema } from "@/server/schemas";
import { getOwned } from "@/server/resume/service";
import { retrieve } from "@/server/resume/retrieve";
import { conflict } from "@/server/errors";

export const runtime = "nodejs";
/** Ownership is checked twice: here (404 for non-owners) and inside retrieve(), which filters every chunk by owner. */
export const POST = route<{ id: string }>({ roles: ["candidate"], limit: [60, 60_000] }, async ({ req, user, params }) => {
  const b = await parseJson(req, searchSchema);
  const doc = getOwned(user.id, params.id);
  if (doc.status !== "READY") throw conflict("This resume is not ready yet.", "resume_not_ready");
  const hits = await retrieve(user.id, b.query, { documentId: doc.id, k: b.k ?? 5 });
  return { results: hits };
});
