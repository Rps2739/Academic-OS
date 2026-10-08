// DOM side of section jumping. BlockNote renders every block as
// `.bn-block-outer[data-id="<blockId>"]`. Jumping only scrolls — it never
// moves the text cursor, so reading can't turn into an accidental edit.

const EDGE_PX = 8;

/** Walks up to the nearest ancestor that actually scrolls (overflow-y:
 * auto/scroll) — verified live to be `.app-main`, not `.app-pane` (which
 * has overflow-y: visible and just sizes to its content). Not hardcoded to
 * a class name so it keeps working if the notes layout changes. */
export function scrollParentOf(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? el;
}

function blockEl(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector(`.bn-block-outer[data-id="${CSS.escape(id)}"]`);
}

export function jumpToSection(container: HTMLElement, ids: string[], dir: 1 | -1): void {
  const parent = scrollParentOf(container);
  const top = parent.getBoundingClientRect().top;
  const positions = ids
    .map((id) => ({ id, el: blockEl(container, id) }))
    .filter((x): x is { id: string; el: HTMLElement } => x.el !== null)
    .map((x) => ({ ...x, y: x.el.getBoundingClientRect().top - top }));
  const target =
    dir === 1
      ? positions.find((p) => p.y > EDGE_PX)
      : [...positions].reverse().find((p) => p.y < -EDGE_PX);
  target?.el.scrollIntoView({ block: "start", behavior: "smooth" });
}

export function jumpToTop(container: HTMLElement): void {
  scrollParentOf(container).scrollTo({ top: 0, behavior: "smooth" });
}

/** True when the note is long enough that jumping helps (> 1.5 screens). */
export function isLongNote(container: HTMLElement): boolean {
  const parent = scrollParentOf(container);
  return parent.scrollHeight > parent.clientHeight * 1.5;
}
