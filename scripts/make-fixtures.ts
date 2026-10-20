// Generates PDF and DOCX copies of the sample resume so upload tests use real binary formats.
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

const dir = path.resolve("tests/fixtures");
const text = fs.readFileSync(path.join(dir, "alex-resume.txt"), "utf8");
const lines = text.split("\n");

async function pdf() {
  const doc = new PDFDocument({ margin: 54 });
  const out = fs.createWriteStream(path.join(dir, "alex-resume.pdf"));
  doc.pipe(out);
  for (const l of lines) doc.fontSize(/^[A-Z ]{4,}$/.test(l) ? 13 : 10).text(l || " ");
  doc.end();
  await new Promise((r) => out.on("finish", r));
}

async function docx() {
  const children = lines.map((l) =>
    /^[A-Z ]{4,}$/.test(l)
      ? new Paragraph({ text: l, heading: HeadingLevel.HEADING_2 })
      : new Paragraph({ children: [new TextRun(l)] }),
  );
  const buf = await Packer.toBuffer(new Document({ sections: [{ children }] }));
  fs.writeFileSync(path.join(dir, "alex-resume.docx"), buf);
}

// An image-only PDF stand-in: a valid PDF with no text layer, to exercise the "no readable text" path.
async function blankPdf() {
  const doc = new PDFDocument();
  const out = fs.createWriteStream(path.join(dir, "scanned-like.pdf"));
  doc.pipe(out);
  doc.rect(50, 50, 200, 200).fill("#cccccc");
  doc.end();
  await new Promise((r) => out.on("finish", r));
}

await pdf();
await docx();
await blankPdf();
fs.writeFileSync(path.join(dir, "fake.pdf"), "this is not really a pdf");
fs.writeFileSync(path.join(dir, "binary.txt"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
console.log("fixtures written to", dir);
