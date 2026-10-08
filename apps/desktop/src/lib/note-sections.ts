// Where a "section" starts in a note, for the ↑Top/‹Prev/Next› jumper and
// Alt+↓/↑. Most of the user's notes have no headings, so when a note has
// none, bold-only lines and short title-like lines ("FROM", "WHERE",
// "Market entry") count instead. Pure and dependency-free so it's
// unit-testable (see note-sections.test.ts).

export interface SectionBlock {
  id: string;
  type: string;
  content?: unknown;
}

interface TextRun {
  type?: string;
  text?: string;
  styles?: { bold?: boolean };
}

const MAX_TITLE_CHARS = 60;
const TRAILING_PUNCTUATION = /[.,;:]$/;

function runs(block: SectionBlock): TextRun[] {
  return Array.isArray(block.content) ? (block.content as TextRun[]) : [];
}

function plainText(block: SectionBlock): string {
  return runs(block)
    .map((r) => (typeof r.text === "string" ? r.text : ""))
    .join("")
    .trim();
}

/** Anything other than an empty paragraph counts as content. */
function hasContent(block: SectionBlock): boolean {
  if (block.type !== "paragraph") return true;
  return plainText(block).length > 0;
}

function isFullyBold(block: SectionBlock): boolean {
  const visible = runs(block).filter((r) => typeof r.text === "string" && r.text.trim().length > 0);
  return visible.length > 0 && visible.every((r) => r.styles?.bold === true);
}

function isTitleLike(block: SectionBlock): boolean {
  const t = plainText(block);
  return t.length > 0 && t.length <= MAX_TITLE_CHARS && !TRAILING_PUNCTUATION.test(t);
}

export function findSectionStarts(blocks: readonly SectionBlock[]): string[] {
  const headings = blocks.filter((b) => b.type === "heading").map((b) => b.id);
  if (headings.length > 0) return headings;

  const out: string[] = [];
  blocks.forEach((block, i) => {
    if (block.type !== "paragraph") return;
    if (isFullyBold(block)) {
      out.push(block.id);
      return;
    }
    if (!isTitleLike(block)) return;
    // A title only counts if some content follows it.
    if (blocks.slice(i + 1).some(hasContent)) out.push(block.id);
  });
  return out;
}
