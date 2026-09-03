import { useCallback, useEffect, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { SearchBox } from "./SearchBox";

interface TreeSidebarProps {
  localDb: SqliteLocalDb;
  userId: string;
  selectedId: string | null;
  onSelect: (node: LocalRow) => void;
  onChanged: () => void; // called after any mutation, so callers can trigger a sync
}

const ROOT_KEY = "__root__";

function parentKey(parentId: string | null): string {
  return parentId ?? ROOT_KEY;
}

export function TreeSidebar({ localDb, userId, selectedId, onSelect, onChanged }: TreeSidebarProps) {
  const [childrenByParent, setChildrenByParent] = useState<Record<string, LocalRow[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadChildren = useCallback(
    async (parentId: string | null) => {
      const rows = await localDb.listChildren(parentId);
      setChildrenByParent((prev) => ({ ...prev, [parentKey(parentId)]: rows }));
    },
    [localDb]
  );

  useEffect(() => {
    void loadChildren(null);
  }, [loadChildren]);

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
    await localDb.put("nodes", { id: node.id, user_id: userId, deleted_at: new Date().toISOString() });
    await loadChildren((node["parent_id"] as string | null) ?? null);
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

  function renderLevel(parentId: string | null) {
    const rows = childrenByParent[parentKey(parentId)] ?? [];
    return (
      <ul className="tree-level">
        {rows.map((node, index) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            isExpanded={expanded.has(node.id)}
            isSelected={selectedId === node.id}
            childRows={childrenByParent[node.id]}
            onToggle={() => toggleExpanded(node.id)}
            onSelect={() => onSelect(node)}
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
            {expanded.has(node.id) && node["kind"] === "folder" && renderChildren(node.id)}
          </TreeNode>
        ))}
      </ul>
    );
  }

  function renderChildren(parentId: string) {
    const rows = childrenByParent[parentId] ?? [];
    return (
      <ul className="tree-level tree-level--nested">
        {rows.map((node, index) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={1}
            isExpanded={expanded.has(node.id)}
            isSelected={selectedId === node.id}
            childRows={childrenByParent[node.id]}
            onToggle={() => toggleExpanded(node.id)}
            onSelect={() => onSelect(node)}
            onRename={(title) => void renameNode(node, title)}
            onDelete={() => void deleteNode(node)}
            onCreateChild={(kind) => void createNode(node.id, kind)}
            onDrop={(draggedId) => {
              if (draggedId === node.id) return;
              const siblings = childrenByParent[parentId] ?? [];
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
            {expanded.has(node.id) && node["kind"] === "folder" && renderChildren(node.id)}
          </TreeNode>
        ))}
      </ul>
    );
  }

  return (
    <div className="tree-sidebar">
      <SearchBox localDb={localDb} onSelect={onSelect} />
      <div className="tree-sidebar__toolbar">
        <button onClick={() => void createNode(null, "folder")}>+ Folder</button>
        <button onClick={() => void createNode(null, "page")}>+ Page</button>
      </div>
      {renderLevel(null)}
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
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  childRows: LocalRow[] | undefined;
  onToggle: () => void;
  onSelect: () => void;
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
  onRename,
  onDelete,
  onCreateChild,
  onDrop,
  onDropInto,
  children,
}: TreeNodeProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(node["title"] as string);
  const isFolder = node["kind"] === "folder";

  return (
    <li
      className="tree-node"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/node-id", node.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedId = e.dataTransfer.getData("text/node-id");
        if (!draggedId) return;
        if (isFolder && e.altKey) onDropInto(draggedId);
        else onDrop(draggedId);
      }}
    >
      <div className={`tree-node__row ${isSelected ? "tree-node__row--selected" : ""}`}>
        {isFolder && (
          <button className="tree-node__toggle" onClick={onToggle}>
            {isExpanded ? "▾" : "▸"}
          </button>
        )}
        {renaming ? (
          <input
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
            {isFolder ? "📁" : "📄"} {node["title"] as string}
          </span>
        )}
        {isFolder && (
          <span className="tree-node__actions">
            <button title="New folder" onClick={() => onCreateChild("folder")}>
              +📁
            </button>
            <button title="New page" onClick={() => onCreateChild("page")}>
              +📄
            </button>
          </span>
        )}
        <button className="tree-node__delete" title="Delete" onClick={onDelete}>
          ×
        </button>
      </div>
      {children}
    </li>
  );
}
