export type Section = { name: string; heading: string | null; text: string };

const HEADINGS: Record<string, RegExp> = {
  summary: /^(professional\s+)?(summary|profile|objective|about( me)?)$/i,
  experience: /^((professional|work|relevant)\s+)?(experience|employment( history)?|work history|career history)$/i,
  skills: /^((technical|core|key)\s+)?(skills|competencies|technologies|tech stack)$/i,
  education: /^(education|academics|academic background|qualifications)$/i,
  projects: /^((selected|personal|key|side)\s+)?projects$/i,
  certifications: /^(certifications?|licenses?|courses)$/i,
  awards: /^(awards|honou?rs|achievements|publications)$/i,
};

function headingKind(line: string): string | null {
  const t = line.replace(/[:\s]+$/, "").trim();
  if (t.length === 0 || t.length > 40) return null;
  for (const [name, re] of Object.entries(HEADINGS)) if (re.test(t)) return name;
  return null;
}

/** Splits normalised resume text into labelled sections, preserving original wording. */
export function detectSections(text: string): Section[] {
  const lines = text.split("\n");
  const out: Section[] = [];
  let cur: Section = { name: "header", heading: null, text: "" };
  for (const line of lines) {
    const kind = headingKind(line);
    if (kind) {
      if (cur.text.trim()) out.push({ ...cur, text: cur.text.trim() });
      cur = { name: kind, heading: line.trim().replace(/:$/, ""), text: "" };
    } else {
      cur.text += line + "\n";
    }
  }
  if (cur.text.trim()) out.push({ ...cur, text: cur.text.trim() });
  return out.length ? out : [{ name: "body", heading: null, text }];
}
