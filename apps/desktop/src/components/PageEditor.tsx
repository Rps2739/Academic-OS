import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { Theme } from "@blocknote/mantine";
import type { Block, BlockNoteEditor } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useEffect, useRef, useState } from "react";
import { Check, ALargeSmall, Type } from "lucide-react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { sanitizeTablePasteHtml } from "../lib/sanitize-table-paste";
import { readPref, writePref, type ReadingFont } from "../lib/reading-prefs";
import { FormatPainterButton } from "./FormatPainterButton";
import { imageFileToDataUrl, isImageFile, isImageOnlyHtml, stripEmbeddedImages } from "../lib/image-embed";

/** Inserts each pasted image as an image block at the cursor — replacing
 * the current block if it's an empty paragraph, same as BlockNote's own
 * file-paste placement. */
async function insertImageFiles(ed: BlockNoteEditor<any, any, any>, files: File[]) {
  let reference = ed.getTextCursorPosition().block;
  for (const file of files) {
    let url: string;
    try {
      url = await imageFileToDataUrl(file);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
      continue;
    }
    const imageBlock = { type: "image", props: { url, name: file.name } };
    reference =
      Array.isArray(reference.content) && reference.content.length === 0
        ? ed.updateBlock(reference, imageBlock)
        : ed.insertBlocks([imageBlock], reference, "after")[0];
  }
}

/** Default toolbar items plus our own Format Painter button — BlockNote
 * has no built-in one. `formattingToolbar={false}` on BlockNoteView (below)
 * suppresses the default toolbar so this one renders instead. */
function CustomFormattingToolbar() {
  return (
    <FormattingToolbar>
      {[...getFormattingToolbarItems(), <FormatPainterButton key="formatPainterButton" />]}
    </FormattingToolbar>
  );
}

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

export interface PageEditorProps {
  localDb: SqliteLocalDb;
  userId: string;
  node: LocalRow;
  onSaved: () => void;
  /** Optional callback to receive the live editor document for the outline rail */
  onDocumentChange?: (blocks: Block[]) => void;
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
  onDocumentChange,
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
        const imageFiles = Array.from(event.clipboardData?.files ?? []).filter(isImageFile);
        if (imageFiles.length > 0 && (!html || isImageOnlyHtml(html))) {
          void insertImageFiles(ed, imageFiles);
          return true;
        }
        return defaultPasteHandler();
      },
      // BlockNote routes file-only pastes, drag-and-drop, and the image
      // block's own "Upload" tab through this — without it, all three
      // silently did nothing. Images become inline data: URLs (see
      // image-embed.ts for why). Other file types belong in the
      // Attachments rail (Drive-backed), not inside the note body.
      uploadFile: async (file, blockId) => {
        if (isImageFile(file)) return imageFileToDataUrl(file);
        window.alert(`"${file.name}" isn't an image — add it from the Attachments panel below the note instead.`);
        // BlockNote already inserted an empty placeholder block for this
        // file and updates it with whatever we return, so return normally
        // and remove the placeholder on the next tick.
        if (blockId) setTimeout(() => editor.removeBlocks([blockId]), 0);
        return "";
      },
    },
    [node.id]
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirtyRef = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const [readingFont, setReadingFont] = useState<ReadingFont>(() => readPref("font", "sans" as ReadingFont));
  const [readingScale, setReadingScale] = useState<number>(() => {
    const s = parseFloat(readPref("scale", "1"));
    return isNaN(s) ? 1 : Math.min(2, Math.max(0.8, s));
  });
  // Local draft of the title so typing in the header is smooth; reseeded
  // whenever a different page is selected. Persisting it writes straight
  // to the node row (same as a sidebar rename) and triggers a sync, which
  // bumps the sidebar's refresh so the tree reflects the new name too.
  const [titleDraft, setTitleDraft] = useState(node["title"] as string);
  useEffect(() => {
    setTitleDraft(node["title"] as string);
  }, [node]);

  // Ctrl+scroll / pinch zoom on the reading area (passive:false mandatory —
  // WebView2 claims native page zoom on ctrl+wheel; we must preventDefault
  // to intercept it. Windows trackpad pinch also delivers as ctrl+wheel.)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setReadingScale((s) => {
        const next = Math.min(2, Math.max(0.8, parseFloat((s + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(2))));
        writePref("scale", String(next));
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard zoom: Ctrl+= (in), Ctrl+- (out), Ctrl+0 (reset)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setReadingScale((s) => { const n = Math.min(2, parseFloat((s + 0.1).toFixed(2))); writePref("scale", String(n)); return n; });
      } else if (e.key === "-") {
        e.preventDefault();
        setReadingScale((s) => { const n = Math.max(0.8, parseFloat((s - 0.1).toFixed(2))); writePref("scale", String(n)); return n; });
      } else if (e.key === "0") {
        e.preventDefault();
        setReadingScale(1); writePref("scale", "1");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function saveTitle() {
    const next = titleDraft.trim();
    const current = node["title"] as string;
    if (!next || next === current) {
      setTitleDraft(current); // discard an empty/blank edit
      return;
    }
    await localDb.put("nodes", { id: node.id as string, user_id: userId, title: next });
    onSaved();
  }

  // Seed the outline with the initial document as soon as the editor is ready
  useEffect(() => {
    onDocumentChange?.(editor.document);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      dirtyRef.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
      onDocumentChange?.(editor.document);
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
    const markdown = stripEmbeddedImages(await editor.blocksToMarkdownLossy(blocks));
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

  const serifStack = `Georgia, "Iowan Old Style", Charter, "Times New Roman", serif`;

  return (
    <div
      className="page-editor"
      ref={containerRef}
      style={{
        "--reading-scale": readingScale,
        "--reading-font": readingFont === "serif" ? serifStack : "var(--font-sans)",
      } as React.CSSProperties}
    >
      <div className="page-editor__head">
        <input
          className="page-editor__title-input"
          value={titleDraft}
          placeholder="Untitled"
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              setTitleDraft(node["title"] as string);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <div className="page-editor__controls">
          <button
            className="btn btn--ghost btn--sm page-editor__font-toggle"
            title={readingFont === "sans" ? "Switch to serif font" : "Switch to sans-serif font"}
            onClick={() => {
              const next: ReadingFont = readingFont === "sans" ? "serif" : "sans";
              setReadingFont(next);
              writePref("font", next);
            }}
          >
            {readingFont === "sans" ? <Type size={13} strokeWidth={2} /> : <ALargeSmall size={13} strokeWidth={2} />}
          </button>
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
      </div>
      <BlockNoteView editor={editor} theme={editorTheme} formattingToolbar={false}>
        <FormattingToolbarController formattingToolbar={CustomFormattingToolbar} />
      </BlockNoteView>
    </div>
  );
}
