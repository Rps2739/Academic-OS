// Run from packages/core:  npx vitest run --root ../../apps/desktop/src/lib --globals
import { findSectionStarts, type SectionBlock } from "./note-sections.ts";

const text = (t: string, bold = false) => ({ type: "text", text: t, styles: bold ? { bold: true } : {} });
const p = (id: string, ...runs: ReturnType<typeof text>[]): SectionBlock => ({ id, type: "paragraph", content: runs });
const h = (id: string, t: string): SectionBlock => ({ id, type: "heading", content: [text(t)] });

describe("findSectionStarts", () => {
  it("uses only headings when the note has any", () => {
    const blocks = [h("a", "Intro"), p("b", text("Short line")), p("c", text("Body text here.")), h("d", "Next")];
    expect(findSectionStarts(blocks)).toEqual(["a", "d"]);
  });

  it("treats fully bold paragraphs as sections when there are no headings", () => {
    const blocks = [p("a", text("Profitability", true)), p("b", text("Revenue minus costs, explained at length.")), p("c", text("Pricing", true), text(" ", false)), p("d", text("More."))];
    expect(findSectionStarts(blocks)).toEqual(["a", "c"]);
  });

  it("treats short title-like lines as sections when followed by content", () => {
    const blocks = [p("a", text("FROM")), p("b", text("Identify the source table(s) and establish the input rows.")), p("c", text("WHERE")), p("d", text("Filter rows."))];
    expect(findSectionStarts(blocks)).toEqual(["a", "c"]);
  });

  it("excludes sentences, lines ending in punctuation, and long lines", () => {
    const blocks = [
      p("a", text("This is a normal sentence.")),
      p("b", text("Note:")),
      p("c", text("x".repeat(61))),
      p("d", text("Body")),
    ];
    expect(findSectionStarts(blocks)).toEqual([]);
  });

  it("excludes a title with nothing after it (empty blocks don't count as content)", () => {
    expect(findSectionStarts([p("a", text("Content first.")), p("b", text("Title"))])).toEqual([]);
    expect(findSectionStarts([p("a", text("Title")), p("b")])).toEqual([]);
  });

  it("counts a non-paragraph block (list, code, image) as content that follows", () => {
    const blocks: SectionBlock[] = [p("a", text("Steps")), { id: "b", type: "numberedListItem", content: [text("one")] }];
    expect(findSectionStarts(blocks)).toEqual(["a"]);
  });

  it("returns [] for an empty note", () => {
    expect(findSectionStarts([])).toEqual([]);
  });
});
