import type { Section } from "./sections";

export type Chunk = { ordinal: number; section: string; heading: string | null; text: string; tokenCount: number };

const approxTokens = (s: string) => Math.ceil(s.length / 4);
const DATE_LINE = /\b((19|20)\d{2}|present|current)\b.*\b((19|20)\d{2}|present|current)\b/i;

/**
 * Section-aware chunking. A new job/project entry (a line carrying a date range) starts a new block so a
 * role and its bullets stay together; blocks are then packed up to maxTokens without crossing a section.
 */
export function chunkSections(sections: Section[], maxTokens = 220): Chunk[] {
  const chunks: Chunk[] = [];
  let ordinal = 0;
  for (const s of sections) {
    const blocks: string[] = [];
    let cur: string[] = [];
    for (const line of s.text.split("\n")) {
      const startsEntry = (s.name === "experience" || s.name === "projects" || s.name === "education") && DATE_LINE.test(line) && cur.length > 1;
      if (startsEntry || (line.trim() === "" && cur.length)) {
        blocks.push(cur.join("\n").trim());
        cur = line.trim() === "" ? [] : [line];
      } else if (line.trim() !== "") cur.push(line);
    }
    if (cur.length) blocks.push(cur.join("\n").trim());

    let buf = "";
    const flush = () => {
      if (!buf.trim()) return;
      chunks.push({ ordinal: ordinal++, section: s.name, heading: s.heading, text: buf.trim(), tokenCount: approxTokens(buf) });
      buf = "";
    };
    for (const b of blocks.filter(Boolean)) {
      if (approxTokens(b) > maxTokens) {
        flush();
        // Oversized block: split on sentence/bullet boundaries rather than mid-word.
        let piece = "";
        for (const part of b.split(/(?<=[.!?])\s+|\n/)) {
          if (approxTokens(piece + part) > maxTokens && piece) {
            buf = piece;
            flush();
            piece = "";
          }
          piece += (piece ? " " : "") + part;
        }
        buf = piece;
        flush();
        continue;
      }
      if (approxTokens(buf + "\n" + b) > maxTokens) flush();
      buf += (buf ? "\n" : "") + b;
    }
    flush();
  }
  return chunks;
}
