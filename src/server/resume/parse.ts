import { AppError } from "../errors";
import { MAX_TEXT_CHARS, type ResumeKind } from "./validate";

export class ParseError extends AppError {
  constructor(code: string, message: string) {
    super(422, code, message);
  }
}

export async function extractText(kind: ResumeKind, buf: Buffer): Promise<string> {
  try {
    if (kind === "txt") return normalize(buf.toString("utf8"));
    if (kind === "docx") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return finish(value);
    }
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const res = await parser.getText();
      return finish(res.text);
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch (e) {
    if (e instanceof ParseError) throw e;
    throw new ParseError("parse_failed", `We could not read this ${kind.toUpperCase()} file. It may be damaged or password-protected. Try exporting it again or upload a .txt copy.`);
  }
}

function finish(raw: string): string {
  const text = normalize(raw);
  if (text.length < 40) {
    throw new ParseError(
      "no_text_found",
      "No readable text was found. This looks like a scanned or image-only document; OCR is not enabled in this build. Upload a text-based PDF, DOCX or .txt file.",
    );
  }
  return text;
}

/** Normalises whitespace only. Never rewrites or invents content. */
export function normalize(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}
