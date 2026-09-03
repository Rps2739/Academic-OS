import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { Block } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useEffect, useRef, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";

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
    return <div className="page-editor page-editor--loading">Loading…</div>;
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
  const editor = useCreateBlockNote({ initialContent: initialBlocks }, [node.id]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe?.();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  async function save() {
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
  }

  return (
    <div className="page-editor">
      <h2 className="page-editor__title">{node["title"] as string}</h2>
      <BlockNoteView editor={editor} />
    </div>
  );
}
