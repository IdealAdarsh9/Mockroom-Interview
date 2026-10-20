import { q } from "../db";
import { cosine, embedQuery, fromBlob, tokenize } from "./embed";
import { notFound } from "../errors";

export type Retrieved = {
  chunkId: string;
  documentId: string;
  section: string;
  heading: string | null;
  text: string;
  score: number;
  injectionFlagged: boolean;
};

type Row = {
  id: string;
  document_id: string;
  section: string;
  heading: string | null;
  text: string;
  embedding: Buffer | null;
  embedding_model: string | null;
  injection_flagged: number;
};

/**
 * Hybrid retrieval: cosine similarity over embeddings blended with keyword overlap.
 * Authorization is part of the query itself: chunks are only ever selected by owner_id, so a caller can
 * never retrieve another user's resume regardless of which documentId they pass.
 */
export async function retrieve(ownerId: string, query: string, opts: { documentId: string; k?: number }): Promise<Retrieved[]> {
  const doc = q.get("SELECT id FROM resume_documents WHERE id = ? AND owner_id = ? AND status = 'READY'", opts.documentId, ownerId);
  if (!doc) throw notFound("Resume not found.");
  const rows = q.all<Row>(
    "SELECT id, document_id, section, heading, text, embedding, embedding_model, injection_flagged FROM resume_chunks WHERE owner_id = ? AND document_id = ?",
    ownerId,
    opts.documentId,
  );
  if (!rows.length) return [];
  const qTokens = new Set(tokenize(query));
  const qVecs = new Map<string, Float32Array>();
  const scored: Retrieved[] = [];
  for (const r of rows) {
    const model = r.embedding_model ?? "local-hash-256-v1";
    if (!qVecs.has(model)) qVecs.set(model, await embedQuery(query, model));
    const sem = r.embedding ? Math.max(0, cosine(qVecs.get(model)!, fromBlob(r.embedding))) : 0;
    const cTokens = tokenize(r.text);
    let hits = 0;
    for (const t of cTokens) if (qTokens.has(t)) hits++;
    const kw = qTokens.size ? Math.min(1, hits / Math.max(3, qTokens.size)) : 0;
    scored.push({
      chunkId: r.id,
      documentId: r.document_id,
      section: r.section,
      heading: r.heading,
      text: r.text,
      score: Number((0.7 * sem + 0.3 * kw).toFixed(4)),
      injectionFlagged: !!r.injection_flagged,
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, opts.k ?? 5);
}

export function chunksByIds(ownerId: string, ids: string[]) {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  return q.all<{ id: string; section: string; text: string; document_id: string }>(
    `SELECT id, section, text, document_id FROM resume_chunks WHERE owner_id = ? AND id IN (${ph})`,
    ownerId,
    ...ids,
  );
}
