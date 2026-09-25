import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { SearchBox } from "./SearchBox";
import { readExpandedFolders, writeExpandedFolders } from "../lib/reading-prefs";
import { Folder, FolderPlus, FileText, FilePlus, ChevronRight, Trash2, Columns2 } from "lucide-react";

interface TreeSidebarProps {
  localDb: SqliteLocalDb;
  userId: string;
  selectedId: string | null;
  onSelect: (node: LocalRow) => void;
  onChanged: () => void; // called after any mutation, so callers can trigger a sync
  onNodesDeleted: (ids: string[]) => void; // so the parent can clear a now-deleted selection
  onNotify: (message: string, undo: () => void) => void; // surfaces an "Undo" toast instead of a confirm dialog
  refreshSignal: number; // bumped by the parent after a remote pull lands — refetch, don't remount
  focusRequest?: { nodeId: string; nonce: number } | null; // expand+reveal a node picked from outside the tree (e.g. Subjects' "Open notes folder")
  onOpenInSplit?: (node: LocalRow) => void; // opens a node in the second split-view pane instead of replacing the main selection
}

const ROOT_KEY = "__root__";

function parentKey(parentId: string | null): string {
  return parentId ?? ROOT_KEY;
}

export function TreeSidebar({ localDb, userId, selectedId, onSelect, onChanged, onNodesDeleted, onNotify, refreshSignal, focusRequest, onOpenInSplit }: TreeSidebarProps) {
  const [childrenByParent, setChildrenByParent] = useState<Record<string, LocalRow[]>>({});
  // Restored on mount so the mount effect below reloads every previously
  // open folder's children — the tree is unmounted whenever another view
  // is shown, and used to come back fully collapsed every time.
  const [expanded, setExpanded] = useState<Set<string>>(readExpandedFolders);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  useEffect(() => {
    writeExpandedFolders(expanded);
  }, [expanded]);

  const loadChildren = useCallback(
    async (parentId: string | null) => {
      const rows = await localDb.listChildren(parentId);
      setChildrenByParent((prev) => ({ ...prev, [parentKey(parentId)]: rows }));
    },
    [localDb]
  );

  // Refetches root plus every currently-expanded folder — on mount, and
  // whenever the parent bumps refreshSignal after a mutation or a remote
  // pull. Deliberately doesn't touch `expanded`/`selectedId` state, unlike
  // the previous `key={refreshTick}` remount hack, which nuked the whole
  // tree's expand state (every expanded folder snapping shut) on every
  // single create/rename/delete/move.
  useEffect(() => {
    void loadChildren(null);
    for (const id of expandedRef.current) {
      void loadChildren(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadChildren, refreshSignal]);

  // Expands every ancestor folder of a node picked from outside the tree
  // (Subjects' "Open notes folder") and loads their children, so the node
  // is actually visible instead of selected-but-buried under collapsed
  // folders. Keyed on a nonce so re-opening the same folder twice in a
  // row still re-reveals it even if nothing else changed.
  useEffect(() => {
    if (!focusRequest) return;
    void (async () => {
      const chain = await localDb.getAncestorChain(focusRequest.nodeId);
      const ancestorIds = chain.slice(0, -1).map((c) => c.id);
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of ancestorIds) next.add(id);
        return next;
      });
      for (const id of ancestorIds) await loadChildren(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  async function createNode(parentId: string | null, kind: "folder" | "page") {
    const siblings = childrenByParent[parentKey(parentId)] ?? [];
    const maxOrder = siblings.reduce((max, s) => Math.max(max, (s["sort_order"] as number) ?? 0), 0);
    const id = crypto.randomUUID();
    await localDb.put("nodes", {
      id,
      user_id: userId,
      parent_id: parentId,
      kind,
      title: kind === "folder" ? "New folder" : "Untitled",
      icon: null,
      sort_order: maxOrder + 1,
    });
    if (kind === "page") {
      await localDb.put("page_bodies", {
        id, // encodeRow maps id -> node_id for this table
        user_id: userId,
        blocks: [],
        markdown: "",
        plaintext: "",
      });
    }
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    await loadChildren(parentId);
    onChanged();
  }

  async function renameNode(node: LocalRow, title: string) {
    await localDb.put("nodes", { id: node.id, user_id: userId, title });
    await loadChildren((node["parent_id"] as string | null) ?? null);
    onChanged();
  }

  async function deleteNode(node: LocalRow) {
    // Gather the node and every descendant folder/page in one shot, so
    // deleting a folder cascades to its whole subtree. Without this, a
    // folder's children kept deleted_at = NULL and became orphans:
    // invisible in the tree (their parent no longer renders) yet still
    // returned by search, still synced to Postgres, their page bodies
    // never cleaned up.
    const descendants = await localDb.raw.select<{ id: string; kind: string }[]>(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM nodes WHERE id = $1
         UNION ALL
         SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id
       )
       SELECT n.id, n.kind FROM nodes n JOIN subtree s ON n.id = s.id WHERE n.deleted_at IS NULL`,
      [node.id]
    );
    const ids = descendants.map((d) => d.id);
    const childCount = ids.length - 1; // excludes the node itself
    const parentId = (node["parent_id"] as string | null) ?? null;

    // No confirm dialog — a modal "are you sure?" on every delete is
    // exactly the friction the user asked to avoid. Instead: delete
    // immediately (it's already just a soft-delete, nothing is actually
    // destroyed), and offer an "Undo" toast for a few seconds, the same
    // pattern Gmail/most editors use for a low-friction safety net.
    const now = new Date().toISOString();
    for (const id of ids) {
      await localDb.put("nodes", { id, user_id: userId, deleted_at: now });
    }
    await loadChildren(parentId);
    onNodesDeleted(ids);
    onChanged();

    const label =
      childCount > 0
        ? `Deleted "${node["title"] as string}" and ${childCount} item${childCount === 1 ? "" : "s"}`
        : `Deleted "${node["title"] as string}"`;
    onNotify(label, () => void undoDelete(ids, parentId));
  }

  async function undoDelete(ids: string[], parentId: string | null) {
    for (const id of ids) {
      await localDb.put("nodes", { id, user_id: userId, deleted_at: null });
    }
    await loadChildren(parentId);
    onChanged();
  }

  async function moveNode(node: LocalRow, newParentId: string | null, newSortOrder: number) {
    await localDb.put("nodes", {
      id: node.id,
      user_id: userId,
      parent_id: newParentId,
      sort_order: newSortOrder,
    });
    const oldParent = (node["parent_id"] as string | null) ?? null;
    await loadChildren(oldParent);
    if (newParentId !== oldParent) await loadChildren(newParentId);
    onChanged();
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!childrenByParent[id]) void loadChildren(id);
  }

  function renderLevel(parentId: string | null, nested: boolean) {
    const rows = childrenByParent[parentKey(parentId)] ?? [];
    if (!nested && rows.length === 0) {
      return <p className="tree-sidebar__empty">Nothing here yet — create a folder or page above.</p>;
    }
    return (
      <ul className={`tree-level ${nested ? "tree-level--nested" : ""}`}>
        {rows.map((node, index) => (
          <TreeNode
            key={node.id}
            node={node}
            isExpanded={expanded.has(node.id)}
            isSelected={selectedId === node.id}
            onToggle={() => toggleExpanded(node.id)}
            onSelect={() => onSelect(node)}
            onOpenSplit={onOpenInSplit ? () => onOpenInSplit(node) : undefined}
            onRename={(title) => void renameNode(node, title)}
            onDelete={() => void deleteNode(node)}
            onCreateChild={(kind) => void createNode(node.id, kind)}
            onDrop={(draggedId) => {
              if (draggedId === node.id) return;
              const siblings = childrenByParent[parentKey(parentId)] ?? [];
              const prevOrder = siblings[index - 1]?.["sort_order"] as number | undefined;
              const nextOrder = node["sort_order"] as number;
              const newOrder = prevOrder !== undefined ? (prevOrder + nextOrder) / 2 : nextOrder - 1;
              const dragged = findNodeById(childrenByParent, draggedId);
              if (dragged) void moveNode(dragged, parentId, newOrder);
            }}
            onDropInto={(draggedId) => {
              if (draggedId === node.id) return;
              const dragged = findNodeById(childrenByParent, draggedId);
              const childSiblings = childrenByParent[node.id] ?? [];
              const maxOrder = childSiblings.reduce((m, s) => Math.max(m, (s["sort_order"] as number) ?? 0), 0);
              if (dragged) void moveNode(dragged, node.id, maxOrder + 1);
            }}
          >
            {expanded.has(node.id) && node["kind"] === "folder" && renderLevel(node.id, true)}
          </TreeNode>
        ))}
      </ul>
    );
  }

  return (
    <div className="tree-sidebar">
      <SearchBox localDb={localDb} onSelect={onSelect} />
      <div className="tree-sidebar__toolbar">
        <button className="btn btn--secondary" onClick={() => void createNode(null, "folder")}>
          <FolderPlus size={14} strokeWidth={2} />
          Folder
        </button>
        <button className="btn btn--secondary" onClick={() => void createNode(null, "page")}>
          <FilePlus size={14} strokeWidth={2} />
          Page
        </button>
      </div>
      <div className="tree-sidebar__tree">{renderLevel(null, false)}</div>
    </div>
  );
}

function findNodeById(map: Record<string, LocalRow[]>, id: string): LocalRow | undefined {
  for (const rows of Object.values(map)) {
    const found = rows.find((r) => r.id === id);
    if (found) return found;
  }
  return undefined;
}

interface TreeNodeProps {
  node: LocalRow;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onOpenSplit?: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onCreateChild: (kind: "folder" | "page") => void;
  onDrop: (draggedId: string) => void;
  onDropInto: (draggedId: string) => void;
  children?: React.ReactNode;
}

function TreeNode({
  node,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  onOpenSplit,
  onRename,
  onDelete,
  onCreateChild,
  onDrop,
  onDropInto,
  children,
}: TreeNodeProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(node["title"] as string);
  const [dropTarget, setDropTarget] = useState(false);
  const isFolder = node["kind"] === "folder";

  return (
    <li
      className="tree-node"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/node-id", node.id)}
      onDragOver={(e) => {
        e.preventDefault();
        if (isFolder) setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(false);
        const draggedId = e.dataTransfer.getData("text/node-id");
        if (!draggedId) return;
        if (isFolder && e.altKey) onDropInto(draggedId);
        else onDrop(draggedId);
      }}
    >
      <div
        className={`tree-node__row ${isSelected ? "tree-node__row--selected" : ""} ${
          dropTarget ? "tree-node__row--drop-target" : ""
        }`}
      >
        {isFolder ? (
          <button
            className="tree-node__toggle"
            title={isExpanded ? "Collapse" : "Expand"}
            onClick={onToggle}
          >
            <ChevronRight size={14} strokeWidth={2} className={isExpanded ? "tree-node__toggle--expanded" : ""} />
          </button>
        ) : (
          <span className="tree-node__toggle-spacer" />
        )}
        <span className="tree-node__icon">
          {isFolder ? <Folder size={14} strokeWidth={2} /> : <FileText size={14} strokeWidth={2} />}
        </span>
        {renaming ? (
          <input
            className="tree-node__rename-input"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setRenaming(false);
              if (draft.trim()) onRename(draft.trim());
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <span
            className="tree-node__title"
            onClick={onSelect}
            onDoubleClick={() => {
              setDraft(node["title"] as string);
              setRenaming(true);
            }}
          >
            {node["title"] as string}
          </span>
        )}
        {isFolder && (
          <span className="tree-node__actions">
            <button className="icon-btn" title="New folder" onClick={() => onCreateChild("folder")}>
              <FolderPlus size={13} strokeWidth={2} />
            </button>
            <button className="icon-btn" title="New page" onClick={() => onCreateChild("page")}>
              <FilePlus size={13} strokeWidth={2} />
            </button>
          </span>
        )}
        {onOpenSplit && (
          <button className="icon-btn" title="Open in split view" onClick={onOpenSplit}>
            <Columns2 size={13} strokeWidth={2} />
          </button>
        )}
        <button className="icon-btn icon-btn--danger" title="Delete" onClick={onDelete}>
          <Trash2 size={13} strokeWidth={2} />
        </button>
      </div>
      {children}
    </li>
  );
}
