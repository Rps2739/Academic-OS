import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { Theme } from "@blocknote/mantine";
import type { Block } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { sanitizeTablePasteHtml } from "../lib/sanitize-table-paste";

/** Matches the editor's chrome (menus, toolbars, selection) to the app's
 * own palette via CSS custom properties, so it doesn't fight BlockNote's
 * own light/dark defaults. */
const editorTheme: Theme = {
  colors: {
    editor: { text: "var(--ink)", background: "transparent" },
    menu: { text: "var(--ink)", background: "var(--surface-3)" },
    tooltip: { text: "var(--ink)", background: "var(--surface-3)" },
    hovered: { text: "var(--ink)", background: "var(--surface-2)" },
    selected: { text: "var(--on-accent)", background: "var(--accent)" },
    disabled: { text: "var(--muted-2)", background: "var(--surface)" },
    shadow: "var(--shadow-md)",
    border: "var(--border)",
    sideMenu: "var(--muted)",
  },
  borderRadius: 7,
  fontFamily: "var(--font-sans)",
};

interface PageEditorProps {
  localDb: SqliteLocalDb;
  userId: string;
  node: LocalRow;
  onSaved: () => void;
}

const SAVE_DEBOUNCE_MS = 800;

/** Outer component: loads the persisted page body before the editor mounts, so BlockNote is created with its real initialContent rather than flashing empty then replacing. */
export function PageEditor(props: PageEditorProps) {
  const [initialBlocks, setInitialBlocks] = useState<Block[] | undefined | null>(null);

  useEffect(() => {
    setInitialBlocks(null);
    let cancelled = false;
    void props.localDb.getLocal("page_bodies", props.node.id).then((body) => {
      if (cancelled) return;
      const blocks = body?.["blocks"] as Block[] | undefined;
      setInitialBlocks(blocks && blocks.length > 0 ? blocks : undefined);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.node.id]);

  if (initialBlocks === null) {
    return (
      <div className="page-editor page-editor--loading">
        <span className="spinner" aria-hidden /> Loading…
      </div>
    );
  }

  return <PageEditorInner {...props} initialBlocks={initialBlocks} />;
}

function PageEditorInner({
  localDb,
  userId,
  node,
  onSaved,
  initialBlocks,
}: PageEditorProps & { initialBlocks: Block[] | undefined }) {
  // Recreated whenever the selected page changes.
  const editor = useCreateBlockNote(
    {
      initialContent: initialBlocks,
      // Excel's clipboard HTML for a table with merged cells (rowspan
      // across time slots, e.g.) can overlap in ways BlockNote's own
      // table-HTML parser can't reconcile — it throws and the paste is
      // silently lost, with no fallback. Pre-clean the HTML ourselves
      // before handing it off; only Excel-shaped table paste takes this
      // path, everything else goes through the normal default handler.
      pasteHandler: ({ event, editor: ed, defaultPasteHandler }) => {
        const html = event.clipboardData?.getData("text/html");
        if (html?.includes("<table")) {
          try {
            ed.pasteHTML(sanitizeTablePasteHtml(html));
            return true;
          } catch (err) {
            // Belt-and-suspenders: the flattened table sanitizeTablePasteHtml
            // produces has no rowspan/colspan left, so BlockNote's table
            // parser shouldn't be able to reject it — but if some other
            // paste content still trips it up, fall back to plain text
            // rather than losing the paste entirely.
            console.error("table paste failed, falling back to plain text:", err);
            const plain = event.clipboardData?.getData("text/plain");
            if (plain) {
              ed.pasteText(plain);
              return true;
            }
          }
        }
        return defaultPasteHandler();
      },
    },
    [node.id]
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirtyRef = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      dirtyRef.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe?.();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // Flush any edit still inside the debounce window before this
      // editor instance is torn down (switching pages recreates it via
      // the [node.id] dep). Without this, the last <800ms of typing was
      // silently lost whenever the user clicked away quickly — the
      // SQLite write still completes after unmount since it's not tied
      // to React's lifecycle. Guarded by dirtyRef so an untouched page
      // doesn't rewrite itself (which would bump updated_at and mark the
      // row dirty for no reason on every page visit). Silent so the
      // page being switched TO doesn't briefly flash this one's
      // "Saving…/Saved" status.
      if (dirtyRef.current) void save({ silent: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  async function save(opts?: { silent?: boolean }) {
    dirtyRef.current = false;
    if (!opts?.silent) setSaveState("saving");
    const blocks = editor.document;
    const markdown = await editor.blocksToMarkdownLossy(blocks);
    // A rough plaintext derivation for full-text search (task 1.8) —
    // strips common markdown punctuation, not a full parser.
    const plaintext = markdown.replace(/[#*_`>[\]()-]/g, " ").replace(/\s+/g, " ").trim();
    await localDb.put("page_bodies", {
      id: node.id, // encodeRow maps id -> node_id for this table
      user_id: userId,
      blocks,
      markdown,
      plaintext,
    });
    onSaved();
    if (!opts?.silent) setSaveState("saved");
  }

  return (
    <div className="page-editor">
      <div className="page-editor__head">
        <h2 className="page-editor__title">{node["title"] as string}</h2>
        <span className={`page-editor__status page-editor__status--${saveState}`} aria-live="polite">
          {saveState === "saving" ? (
            <>
              <span className="spinner" aria-hidden /> Saving…
            </>
          ) : saveState === "saved" ? (
            <>
              <Check size={12} strokeWidth={2.5} /> Saved
            </>
          ) : null}
        </span>
      </div>
      <BlockNoteView editor={editor} theme={editorTheme} />
    </div>
  );
}
