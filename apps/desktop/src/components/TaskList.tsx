import { useEffect, useRef, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { Plus, Check, Trash2, Calendar, Flag, Folder } from "lucide-react";

interface TaskListProps {
  localDb: SqliteLocalDb;
  userId: string;
  onChanged: () => void;
  refreshSignal: number; // bumped after a sync round — refetch so remotely-pulled task changes appear live
}

type Filter = "open" | "done" | "all";

const PRIORITY_LABELS = ["None", "Low", "Medium", "High"] as const;
const UNCATEGORIZED = "__uncategorized__";

/** yyyy-MM-dd for a native <input type="date"> from an ISO timestamp, local time. */
function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

/** A task is overdue only once its due *date* is strictly in the past —
 * compared by calendar day, not raw instant. Due dates are date-only
 * (stored at UTC midnight), so an instant comparison wrongly flagged a
 * task due *today* as overdue the moment local time passed that stored
 * midnight. */
function isOverdue(dueAt: string | null, status: string): boolean {
  if (!dueAt || status !== "open") return false;
  return toDateInputValue(dueAt) < toDateInputValue(new Date().toISOString());
}

/**
 * Task CRUD (design manual §2.1) — list, due dates, priority, done.
 * Categories reuse the existing notes folder hierarchy (tasks.node_id,
 * already in the schema for exactly this) rather than a new tagging
 * system — "SIBM" or "Personal" is just a folder, same as it is for
 * notes, so grouping tasks under it needs no new table or migration.
 */
export function TaskList({ localDb, userId, onChanged, refreshSignal }: TaskListProps) {
  const [tasks, setTasks] = useState<LocalRow[]>([]);
  const [categories, setCategories] = useState<LocalRow[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [draft, setDraft] = useState("");
  const [draftCategory, setDraftCategory] = useState<string>(UNCATEGORIZED);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const rows = await localDb.raw.select<Record<string, unknown>[]>(
      `SELECT * FROM tasks WHERE deleted_at IS NULL
       ORDER BY (status = 'open') DESC, due_at IS NULL, due_at ASC, priority DESC, sort_order ASC`
    );
    setTasks(rows as LocalRow[]);
  }

  async function refreshCategories() {
    const rows = await localDb.raw.select<Record<string, unknown>[]>(
      `SELECT * FROM nodes WHERE kind = 'folder' AND deleted_at IS NULL ORDER BY title ASC`
    );
    setCategories(rows as LocalRow[]);
  }

  useEffect(() => {
    // A sync round can land while the user is mid-edit in an inline task
    // field; refetching then would replace `tasks` and wipe the
    // uncommitted keystrokes. Skip the refetch in that case (it'll run
    // on the next signal, once they've clicked away). On mount nothing
    // is focused, so the initial load always runs.
    const active = document.activeElement;
    if (active && active.closest(".task-list__items")) return;
    void refresh();
    void refreshCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  async function addTask() {
    const title = draft.trim();
    if (!title) return;
    const maxOrder = tasks.reduce((m, t) => Math.max(m, (t["sort_order"] as number) ?? 0), 0);
    await localDb.put("tasks", {
      id: crypto.randomUUID(),
      user_id: userId,
      title,
      notes: null,
      due_at: null,
      status: "open",
      priority: 0,
      completed_at: null,
      sort_order: maxOrder + 1,
      node_id: draftCategory === UNCATEGORIZED ? null : draftCategory,
      project_id: null,
    });
    setDraft("");
    await refresh();
    onChanged();
    inputRef.current?.focus();
  }

  async function toggleDone(task: LocalRow) {
    const done = task["status"] === "done";
    await localDb.put("tasks", {
      id: task.id as string,
      user_id: userId,
      status: done ? "open" : "done",
      completed_at: done ? null : new Date().toISOString(),
    });
    await refresh();
    onChanged();
  }

  async function updateTask(task: LocalRow, patch: Record<string, unknown>) {
    await localDb.put("tasks", { id: task.id as string, user_id: userId, ...patch });
    await refresh();
    onChanged();
  }

  async function deleteTask(task: LocalRow) {
    await localDb.put("tasks", {
      id: task.id as string,
      user_id: userId,
      deleted_at: new Date().toISOString(),
    });
    await refresh();
    onChanged();
  }

  function cyclePriority(task: LocalRow) {
    const current = (task["priority"] as number) ?? 0;
    void updateTask(task, { priority: current >= 3 ? 0 : current + 1 });
  }

  const visible = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "open") return t["status"] === "open";
    return t["status"] === "done";
  });

  const categoryTitle = (id: string | null) =>
    (id && categories.find((c) => c.id === id)?.["title"] as string | undefined) ?? "Uncategorized";

  const grouped = new Map<string, LocalRow[]>();
  for (const task of visible) {
    const key = (task["node_id"] as string | null) ?? UNCATEGORIZED;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(task);
  }
  const groupKeys = [...grouped.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return categoryTitle(a).localeCompare(categoryTitle(b));
  });

  return (
    <div className="task-list">
      <div className="task-list__header">
        <h1 className="task-list__title">Tasks</h1>
        <div className="task-list__filters" role="tablist">
          {(["open", "done", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`task-list__filter ${filter === f ? "task-list__filter--active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "open" ? "Open" : f === "done" ? "Done" : "All"}
            </button>
          ))}
        </div>
      </div>

      <form
        className="task-list__add"
        onSubmit={(e) => {
          e.preventDefault();
          void addTask();
        }}
      >
        <button type="submit" className="task-list__add-submit" title="Add task">
          <Plus size={16} strokeWidth={2} />
        </button>
        <input
          ref={inputRef}
          className="task-list__add-input"
          placeholder="Add a task…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <select
          className="task-list__add-category"
          value={draftCategory}
          onChange={(e) => setDraftCategory(e.target.value)}
          title="Category"
        >
          <option value={UNCATEGORIZED}>No category</option>
          {categories.map((c) => (
            <option key={c.id as string} value={c.id as string}>
              {c["title"] as string}
            </option>
          ))}
        </select>
      </form>

      {visible.length === 0 ? (
        <p className="task-list__empty">
          {filter === "done" ? "Nothing completed yet." : "Nothing here — add a task above."}
        </p>
      ) : (
        groupKeys.map((key) => (
          <section key={key} className="task-group">
            <h2 className="task-group__title">
              <Folder size={12} strokeWidth={2} />
              {categoryTitle(key === UNCATEGORIZED ? null : key)}
              <span className="task-group__count">{grouped.get(key)!.length}</span>
            </h2>
            <ul className="task-list__items">
              {grouped.get(key)!.map((task) => {
                const done = task["status"] === "done";
                const priority = (task["priority"] as number) ?? 0;
                const dueAt = task["due_at"] as string | null;
                return (
                  <li key={task.id as string} className={`task-item ${done ? "task-item--done" : ""}`}>
                    <button
                      className={`task-item__check ${done ? "task-item__check--done" : ""}`}
                      onClick={() => void toggleDone(task)}
                      title={done ? "Mark open" : "Mark done"}
                    >
                      {done && <Check size={12} strokeWidth={3} />}
                    </button>
                    <input
                      className="task-item__title"
                      value={task["title"] as string}
                      onChange={(e) =>
                        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, title: e.target.value } : t)))
                      }
                      onBlur={(e) => void updateTask(task, { title: e.target.value.trim() || task["title"] })}
                    />
                    <select
                      className="task-item__category"
                      value={(task["node_id"] as string | null) ?? UNCATEGORIZED}
                      onChange={(e) =>
                        void updateTask(task, {
                          node_id: e.target.value === UNCATEGORIZED ? null : e.target.value,
                        })
                      }
                      title="Category"
                    >
                      <option value={UNCATEGORIZED}>No category</option>
                      {categories.map((c) => (
                        <option key={c.id as string} value={c.id as string}>
                          {c["title"] as string}
                        </option>
                      ))}
                    </select>
                    {priority > 0 ? (
                      <button
                        className={`task-item__priority task-item__priority--${priority}`}
                        onClick={() => cyclePriority(task)}
                        title={`Priority: ${PRIORITY_LABELS[priority]}`}
                      >
                        <Flag size={12} strokeWidth={2} />
                      </button>
                    ) : (
                      <button
                        className="icon-btn task-item__priority-empty"
                        onClick={() => cyclePriority(task)}
                        title="Set priority"
                      >
                        <Flag size={12} strokeWidth={2} />
                      </button>
                    )}
                    <label
                      className={`task-item__due ${
                        isOverdue(dueAt, task["status"] as string) ? "task-item__due--overdue" : ""
                      }`}
                    >
                      <Calendar size={12} strokeWidth={2} />
                      <input
                        type="date"
                        value={toDateInputValue(dueAt)}
                        onChange={(e) =>
                          void updateTask(task, {
                            due_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                          })
                        }
                      />
                    </label>
                    <button className="icon-btn icon-btn--danger" title="Delete" onClick={() => void deleteTask(task)}>
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
