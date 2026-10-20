import { badRequest } from "../errors";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_CHARS = 200_000;

export type ResumeKind = "pdf" | "docx" | "txt";

const MIME: Record<ResumeKind, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain", ""],
};

/** Validates extension, declared MIME type, size and the real file signature. Returns the detected kind. */
export function validateUpload(name: string, mime: string, buf: Buffer): ResumeKind {
  if (buf.length === 0) throw badRequest("The file is empty.", "empty_file");
  if (buf.length > MAX_UPLOAD_BYTES) throw badRequest(`The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, "file_too_large");
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (!["pdf", "docx", "txt"].includes(ext)) throw badRequest("Upload a PDF, DOCX or plain-text (.txt) resume.", "unsupported_type");
  const kind = ext as ResumeKind;
  if (!MIME[kind].includes(mime.toLowerCase().split(";")[0].trim())) {
    throw badRequest(`The file's type (${mime || "unknown"}) does not match its .${kind} extension.`, "mime_mismatch");
  }
  if (kind === "pdf" && buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw badRequest("This file is not a valid PDF.", "bad_signature");
  if (kind === "docx") {
    const zip = buf.subarray(0, 4);
    if (!(zip[0] === 0x50 && zip[1] === 0x4b && zip[2] === 0x03 && zip[3] === 0x04)) throw badRequest("This file is not a valid DOCX document.", "bad_signature");
  }
  if (kind === "txt") {
    if (buf.includes(0)) throw badRequest("This file contains binary data and is not plain text.", "bad_signature");
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      throw badRequest("The text file must be UTF-8 encoded.", "bad_encoding");
    }
  }
  return kind;
}

export function safeDisplayName(name: string) {
  // The display name is only ever rendered as text; strip path parts and control characters anyway.
  return name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f<>]/g, "").slice(0, 120) || "resume";
}
