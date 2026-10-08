import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

// Find-in-note using the CSS Custom Highlight API: we build Range objects
// over the editor's text nodes and register them as named highlights,
// styled in App.css via ::highlight(). Nothing is inserted into the DOM and
// no editor transaction happens, so searching can never modify the note or
// trigger a save. Known limit: a match split across two differently
// formatted runs (e.g. half bold) isn't found.

interface HighlightLike {
  new (...ranges: Range[]): unknown;
}
interface HighlightRegistryLike {
  set(name: string, value: unknown): void;
  delete(name: string): void;
}

const registry = (): HighlightRegistryLike | undefined =>
  (CSS as unknown as { highlights?: HighlightRegistryLike }).highlights;
const HighlightCtor = (): HighlightLike | undefined =>
  (window as unknown as { Highlight?: HighlightLike }).Highlight;

function findRanges(root: HTMLElement, query: string): Range[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const out: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue ?? "").toLowerCase();
    let from = 0;
    for (let at = text.indexOf(q, from); at !== -1; at = text.indexOf(q, from)) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + q.length);
      out.push(range);
      from = at + q.length;
    }
  }
  return out;
}

interface NoteFindBarProps {
  container: HTMLElement;
  docVersion: number;
  onClose: () => void;
}

export function NoteFindBar({ container, docVersion, onClose }: NoteFindBarProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const ranges = useMemo(() => {
    const root = container.querySelector(".bn-editor") as HTMLElement | null;
    return root ? findRanges(root, query) : [];
    // docVersion: recompute when the note text changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, query, docVersion]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    const reg = registry();
    const H = HighlightCtor();
    if (reg && H) {
      reg.set("note-find", new H(...ranges));
      const current = ranges[index];
      if (current) reg.set("note-find-current", new H(current));
      else reg.delete("note-find-current");
    }
    ranges[index]?.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [ranges, index]);

  useEffect(
    () => () => {
      registry()?.delete("note-find");
      registry()?.delete("note-find-current");
    },
    []
  );

  const step = (dir: 1 | -1) => {
    if (ranges.length === 0) return;
    setIndex((i) => (i + dir + ranges.length) % ranges.length);
  };

  return (
    <div className="note-find" role="search">
      <input
        ref={inputRef}
        className="note-find__input"
        placeholder="Find in note"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="note-find__count">{query ? (ranges.length ? `${index + 1} of ${ranges.length}` : "No matches") : ""}</span>
      <button className="icon-btn" title="Previous (Shift+Enter)" onClick={() => step(-1)} disabled={ranges.length === 0}>
        <ChevronUp size={14} strokeWidth={2} />
      </button>
      <button className="icon-btn" title="Next (Enter)" onClick={() => step(1)} disabled={ranges.length === 0}>
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      <button className="icon-btn" title="Close (Esc)" onClick={onClose}>
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
