import { useMemo, useState } from "react";
import type { Block } from "@blocknote/core";
import { List, Highlighter } from "lucide-react";

interface Heading { id: string; level: number; text: string }
interface Highlight { id: string; text: string; color: string }

function inlineText(block: Block): string {
  return ((block.content ?? []) as Array<{ text?: string } | string>)
    .map((c) => (typeof c === "string" ? c : (c as { text?: string }).text ?? ""))
    .join("");
}

function walk(blocks: Block[], headings: Heading[], highlights: Highlight[]): void {
  for (const b of blocks) {
    if (b.type === "heading") {
      const text = inlineText(b);
      if (text) headings.push({ id: b.id, level: (b.props as { level?: number }).level ?? 1, text });
    }
    for (const c of (b.content ?? []) as Array<{ styles?: { backgroundColor?: string }; text?: string }>) {
      const bg = c?.styles?.backgroundColor;
      if (bg && c.text) highlights.push({ id: b.id, text: c.text, color: bg });
    }
    if ((b as { children?: Block[] }).children?.length) {
      walk((b as { children: Block[] }).children, headings, highlights);
    }
  }
}

function scrollToBlock(id: string) {
  const el = document.querySelector(`[data-id="${id}"]`) ?? document.querySelector(`[data-node-id="${id}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Rough mapping of BlockNote's named colors to CSS color values for the swatches
const COLOR_MAP: Record<string, string> = {
  yellow: "#f5c518",
  blue: "#4a9eff",
  red: "#f56565",
  green: "#48bb78",
  purple: "#9f7aea",
  pink: "#ed64a6",
  gray: "#a0aec0",
  orange: "#ed8936",
  default: "var(--accent)",
};

interface NoteOutlineProps {
  blocks: Block[];
}

type Tab = "outline" | "highlights";

export function NoteOutline({ blocks }: NoteOutlineProps) {
  const [tab, setTab] = useState<Tab>("outline");

  const { headings, highlights } = useMemo(() => {
    const h: Heading[] = [];
    const hl: Highlight[] = [];
    walk(blocks, h, hl);
    return { headings: h, highlights: hl };
  }, [blocks]);

  return (
    <aside className="note-outline">
      <div className="note-outline__tabs">
        <button
          className={`note-outline__tab ${tab === "outline" ? "note-outline__tab--active" : ""}`}
          onClick={() => setTab("outline")}
          title="Table of contents"
        >
          <List size={13} strokeWidth={2} />
          Outline
        </button>
        <button
          className={`note-outline__tab ${tab === "highlights" ? "note-outline__tab--active" : ""}`}
          onClick={() => setTab("highlights")}
          title="Review highlights"
        >
          <Highlighter size={13} strokeWidth={2} />
          Highlights
        </button>
      </div>

      <div className="note-outline__body">
        {tab === "outline" ? (
          headings.length === 0 ? (
            <p className="note-outline__empty">No headings yet. Add an H1, H2, or H3 to see an outline.</p>
          ) : (
            <ul className="note-outline__list">
              {headings.map((h) => (
                <li
                  key={h.id}
                  className={`note-outline__item note-outline__item--h${h.level}`}
                  onClick={() => scrollToBlock(h.id)}
                  title={h.text}
                >
                  {h.text}
                </li>
              ))}
            </ul>
          )
        ) : (
          highlights.length === 0 ? (
            <p className="note-outline__empty">No highlights yet. Select text and use the formatting toolbar to highlight it.</p>
          ) : (
            <ul className="note-outline__list">
              {highlights.map((hl, i) => (
                <li
                  key={`${hl.id}-${i}`}
                  className="note-outline__highlight"
                  onClick={() => scrollToBlock(hl.id)}
                  title={hl.text}
                >
                  <span
                    className="note-outline__swatch"
                    style={{ background: COLOR_MAP[hl.color] ?? hl.color }}
                  />
                  <span className="note-outline__highlight-text">{hl.text}</span>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </aside>
  );
}
