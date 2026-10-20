import fs from "node:fs";
import path from "node:path";
import { env } from "../env";
import { q, tx, uid, nowIso, json } from "../db";
import { sha256 } from "../crypto";
import { audit } from "../audit";
import { AppError, notFound } from "../errors";
import { safeDisplayName, validateUpload, type ResumeKind } from "./validate";
import { extractText } from "./parse";
import { detectSections } from "./sections";
import { chunkSections } from "./chunk";
import { getEmbedder, toBlob } from "./embed";
import { looksLikeInjection } from "./injection";
import { chunksByIds } from "./retrieve";

export type ResumeRow = {
  id: string;
  owner_id: string;
  original_name: string;
  storage_key: string;
  mime: string;
  size_bytes: number;
  status: "UPLOADED" | "PARSING" | "CHUNKING" | "EMBEDDING" | "READY" | "FAILED";
  progress: number;
  error_code: string | null;
  error_message: string | null;
  extracted_text: string | null;
  sections_json: string | null;
  char_count: number;
  created_at: string;
  updated_at: string;
};

const MIME_FOR: Record<ResumeKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

const setStatus = (id: string, status: ResumeRow["status"], progress: number) =>
  q.run("UPDATE resume_documents SET status = ?, progress = ?, updated_at = ? WHERE id = ?", status, progress, nowIso(), id);

/** Stores the file under a random key and returns immediately; processing continues in the background. */
export function createResume(ownerId: string, file: { name: string; mime: string; data: Buffer }, opts: { replaceId?: string; inline?: boolean } = {}) {
  const kind = validateUpload(file.name, file.mime, file.data);
  if (opts.replaceId) getOwned(ownerId, opts.replaceId); // throws if not owner

  const id = uid();
  const storageKey = `${uid()}.bin`;
  fs.mkdirSync(env.uploadDir, { recursive: true });
  fs.writeFileSync(path.join(env.uploadDir, storageKey), file.data, { mode: 0o600 });
  q.run(
    "INSERT INTO resume_documents (id, owner_id, original_name, storage_key, mime, size_bytes, sha256, status, progress) VALUES (?,?,?,?,?,?,?,'UPLOADED',5)",
    id,
    ownerId,
    safeDisplayName(file.name),
    storageKey,
    MIME_FOR[kind],
    file.data.length,
    sha256(file.data),
  );
  audit({ id: ownerId, role: "candidate" }, "resume.upload", { type: "resume", id }, { sizeBytes: file.data.length, kind });

  const work = processResume(ownerId, id, kind, file.data).then(() => {
    if (opts.replaceId) {
      const done = q.get<{ status: string }>("SELECT status FROM resume_documents WHERE id = ?", id);
      // Only retire the old resume once the new one is usable, so a failed replacement never leaves the user empty-handed.
      if (done?.status === "READY") deleteResume(ownerId, opts.replaceId!, { reason: "replaced" });
    }
  });
  if (opts.inline) return { id, done: work };
  work.catch(() => {});
  return { id, done: work };
}

export async function processResume(ownerId: string, id: string, kind: ResumeKind, data: Buffer) {
  try {
    setStatus(id, "PARSING", 20);
    const text = await extractText(kind, data);
    const sections = detectSections(text);
    q.run(
      "UPDATE resume_documents SET extracted_text = ?, sections_json = ?, char_count = ?, updated_at = ? WHERE id = ?",
      text,
      JSON.stringify(sections.map((s) => ({ name: s.name, heading: s.heading, chars: s.text.length }))),
      text.length,
      nowIso(),
      id,
    );
    setStatus(id, "CHUNKING", 45);
    const chunks = chunkSections(sections);
    setStatus(id, "EMBEDDING", 65);
    const embedder = getEmbedder();
    const vectors = await embedder.embed(chunks.map((c) => c.text));
    tx(() => {
      q.run("DELETE FROM resume_chunks WHERE document_id = ?", id);
      chunks.forEach((c, i) =>
        q.run(
          "INSERT INTO resume_chunks (id, document_id, owner_id, ordinal, section, heading, text, token_count, embedding, embedding_model, injection_flagged) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          uid(),
          id,
          ownerId,
          c.ordinal,
          c.section,
          c.heading,
          c.text,
          c.tokenCount,
          toBlob(vectors[i]),
          embedder.model,
          looksLikeInjection(c.text) ? 1 : 0,
        ),
      );
    });
    setStatus(id, "READY", 100);
  } catch (e) {
    const err = e instanceof AppError ? e : new AppError(500, "processing_failed", "We hit a problem while processing this resume. Please try again.");
    q.run(
      "UPDATE resume_documents SET status = 'FAILED', progress = 100, error_code = ?, error_message = ?, updated_at = ? WHERE id = ?",
      err.code,
      err.message,
      nowIso(),
      id,
    );
  }
}

export function getOwned(ownerId: string, id: string): ResumeRow {
  const row = q.get<ResumeRow>("SELECT * FROM resume_documents WHERE id = ? AND owner_id = ?", id, ownerId);
  if (!row) throw notFound("Resume not found.");
  return row;
}

export function listResumes(ownerId: string) {
  return q.all<ResumeRow>("SELECT * FROM resume_documents WHERE owner_id = ? ORDER BY created_at DESC", ownerId).map(publicResume);
}

export function publicResume(r: ResumeRow) {
  const chunkCount = q.get<{ n: number }>("SELECT COUNT(*) n FROM resume_chunks WHERE document_id = ?", r.id)?.n ?? 0;
  return {
    id: r.id,
    name: r.original_name,
    sizeBytes: r.size_bytes,
    status: r.status,
    progress: r.progress,
    error: r.error_code ? { code: r.error_code, message: r.error_message } : null,
    charCount: r.char_count,
    sections: json<{ name: string; heading: string | null; chars: number }[]>(r.sections_json, []),
    chunkCount,
    createdAt: r.created_at,
  };
}

export function resumePreview(ownerId: string, id: string) {
  const r = getOwned(ownerId, id);
  const chunks = q
    .all<{ id: string; section: string; token_count: number; injection_flagged: number }>(
      "SELECT id, section, token_count, injection_flagged FROM resume_chunks WHERE document_id = ? AND owner_id = ? ORDER BY ordinal",
      id,
      ownerId,
    )
    .map((c) => ({ id: c.id, section: c.section, tokens: c.token_count, flagged: !!c.injection_flagged }));
  return { ...publicResume(r), previewText: (r.extracted_text ?? "").slice(0, 6000), truncated: (r.extracted_text ?? "").length > 6000, chunks };
}

export function deleteResume(ownerId: string, id: string, meta: { reason?: string } = {}) {
  const r = getOwned(ownerId, id);
  tx(() => {
    q.run("DELETE FROM resume_chunks WHERE document_id = ?", id); // vectors go with the document
    q.run("DELETE FROM resume_documents WHERE id = ?", id);
  });
  try {
    fs.rmSync(path.join(env.uploadDir, r.storage_key), { force: true });
  } catch {
    /* file already gone */
  }
  audit({ id: ownerId, role: "candidate" }, "resume.delete", { type: "resume", id }, { reason: meta.reason ?? "user_request" });
}

export function latestReadyResume(ownerId: string) {
  return q.get<ResumeRow>("SELECT * FROM resume_documents WHERE owner_id = ? AND status = 'READY' ORDER BY created_at DESC LIMIT 1", ownerId);
}

export { chunksByIds };
