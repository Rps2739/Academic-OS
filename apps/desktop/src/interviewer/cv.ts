// Turns pasted CV text into "walk me through this" prompts. Pure; no imports.
// Ids are a hash of the normalised line, so progress survives re-pasting
// the same CV (edited lines simply become new questions).

export interface CvPrompt {
  id: string;
  line: string;
}

const BULLET = /^\s*(?:[-*•▪◦·–—]|\d+[.)])\s*/;
const MIN_WORDS = 5;

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function cvPrompts(text: string): CvPrompt[] {
  const seen = new Set<string>();
  const out: CvPrompt[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(BULLET, "").replace(/\s+/g, " ").trim();
    if (line.split(" ").length < MIN_WORDS) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `cv-${hash(key)}`, line });
  }
  return out;
}
