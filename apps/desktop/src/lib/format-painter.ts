import type { BlockNoteEditor } from "@blocknote/core";

/**
 * BlockNote's own editor.getActiveStyles() reads marks at the END of the
 * current selection ($to) — correct for toolbar-highlighting a cursor
 * position, but wrong for "copy the format of what I just selected": for
 * a large or whole-document selection, $to can land at a boundary (end of
 * doc, a trailing empty block) where the mark doesn't carry through, even
 * though the rest of the selection has it. Reading from the START of the
 * selection ($from) instead matches how a format painter is actually
 * used — copy the formatting of the text the selection begins with.
 */
export function getStylesAtSelectionStart(editor: BlockNoteEditor): Record<string, boolean | string> {
  const styleSchema = editor.schema.styleSchema as Record<string, { type: string; propSchema: string }>;
  return editor.transact((tr) => {
    const styles: Record<string, boolean | string> = {};
    for (const mark of tr.selection.$from.marks()) {
      const config = styleSchema[mark.type.name];
      if (!config) continue;
      styles[config.type] = config.propSchema === "boolean" ? true : (mark.attrs.stringValue as string);
    }
    return styles;
  });
}

// Module-level (not React state) because the formatting toolbar unmounts
// and remounts a fresh button instance every time the text selection
// clears and re-forms — exactly what happens between "select source text,
// copy" and "select target text, apply". React state local to the button
// wouldn't survive that; this does.
export interface CopiedFormat {
  styles: Record<string, boolean | string>;
}

let copied: CopiedFormat | null = null;
const listeners = new Set<() => void>();

export function getCopiedFormat(): CopiedFormat | null {
  return copied;
}

export function isArmed(): boolean {
  return copied !== null;
}

export function copyFormat(format: CopiedFormat) {
  copied = format;
  listeners.forEach((fn) => fn());
}

export function disarm() {
  copied = null;
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
