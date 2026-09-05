import { useEffect, useState } from "react";
import { ListTodo, Check, Plus, Trash2, Flag, Calendar } from "lucide-react";
import type { LocalRow } from "@academic-os/core";
import { useWidgetData } from "./useWidgetData";
import { WidgetHeader } from "./WidgetHeader";

const POLL_MS = 20_000; // picks up changes the main window's sync loop pulls in

function formatDue(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "Today";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Desktop widget panel (design manual §2.2), pinned below other windows — full task CRUD, not just a readout. */
export function TasksWidget() {
  const { userId, localDb, loading } = useWidgetData();
  const [tasks, setTasks] = useState<LocalRow[]>([]);
  const [categories, setCategories] = useState<LocalRow[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  async function refresh() {
    if (!localDb) return;
    const [taskRows, categoryRows] = await Promise.all([
      localDb.raw.select<Record<string, unknown>[]>(
        `SELECT * FROM tasks WHERE status = 'open' AND deleted_at IS NULL
         ORDER BY due_at IS NULL, due_at ASC, priority DESC, sort_order ASC LIMIT 30`
      ),
      localDb.raw.select<Record<string, unknown>[]>(
        `SELECT * FROM nodes WHERE kind = 'folder' AND deleted_at IS NULL ORDER BY title ASC`
      ),
    ]);
    setTasks(taskRows as LocalRow[]);
    setCategories(categoryRows as LocalRow[]);
  }

  useEffect(() => {
    if (!localDb) return;
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDb]);

  async function addTask() {
    const title = draft.trim();
    if (!title || !localDb || !userId) return;
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
      node_id: null,
      project_id: null,
    });
    setDraft("");
    await refresh();
  }

  async function toggleDone(task: LocalRow) {
    if (!localDb || !userId) return;
    await localDb.put("tasks", {
      id: task.id as string,
      user_id: userId,
      status: "done",
      completed_at: new Date().toISOString(),
    });
    await refresh();
  }

  async function updateTask(task: LocalRow, patch: Record<string, unknown>) {
    if (!localDb || !userId) return;
    await localDb.put("tasks", { id: task.id as string, user_id: userId, ...patch });
    await refresh();
  }

  async function deleteTask(task: LocalRow) {
    if (!localDb || !userId) return;
    await localDb.put("tasks", { id: task.id as string, user_id: userId, deleted_at: new Date().toISOString() });
    await refresh();
  }

  function cyclePriority(task: LocalRow) {
    const current = (task["priority"] as number) ?? 0;
    void updateTask(task, { priority: current >= 3 ? 0 : current + 1 });
  }

  const categoryTitle = (id: string | null) =>
    (id && categories.find((c) => c.id === id)?.["title"] as string | undefined) ?? null;

  return (
    <div className="widget-panel">
      <WidgetHeader icon={<ListTodo size={13} strokeWidth={2} />} label="Tasks" />
      <div className="widget-panel__body">
        {loading ? (
          <p className="widget-panel__empty">Loading…</p>
        ) : !userId ? (
          <p className="widget-panel__empty">Sign in from the main window.</p>
        ) : (
          <>
            {tasks.length === 0 ? (
              <p className="widget-panel__empty">Nothing open. Nice.</p>
            ) : (
              <ul className="widget-panel__list">
                {tasks.map((t) => {
                  const priority = (t["priority"] as number) ?? 0;
                  const dueAt = t["due_at"] as string | null;
                  const category = categoryTitle((t["node_id"] as string | null) ?? null);
                  const editing = editingId === t.id;
                  return (
                    <li key={t.id as string} className="widget-task widget-task--full">
                      <button className="widget-task__check" onClick={() => void toggleDone(t)} title="Mark done">
                        <Check size={10} strokeWidth={3} />
                      </button>
                      <div className="widget-task__main">
                        {editing ? (
                          <input
                            className="widget-task__edit-input"
                            autoFocus
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onBlur={() => {
                              setEditingId(null);
                              if (editDraft.trim()) void updateTask(t, { title: editDraft.trim() });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                        ) : (
                          <span
                            className="widget-task__title"
                            onDoubleClick={() => {
                              setEditDraft(t["title"] as string);
                              setEditingId(t.id as string);
                            }}
                            title="Double-click to rename"
                          >
                            {t["title"] as string}
                          </span>
                        )}
                        {(dueAt || priority > 0 || category) && (
                          <div className="widget-task__meta">
                            {dueAt && (
                              <span className="widget-task__meta-item">
                                <Calendar size={10} strokeWidth={2} />
                                {formatDue(dueAt)}
                              </span>
                            )}
                            {priority > 0 && (
                              <span className={`widget-task__meta-item widget-task__meta-item--p${priority}`}>
                                <Flag size={10} strokeWidth={2} />
                              </span>
                            )}
                            {category && <span className="widget-task__meta-item widget-task__chip">{category}</span>}
                          </div>
                        )}
                      </div>
                      <button className="widget-task__flag" title="Cycle priority" onClick={() => cyclePriority(t)}>
                        <Flag size={11} strokeWidth={2} />
                      </button>
                      <button className="widget-task__delete" title="Delete" onClick={() => void deleteTask(t)}>
                        <Trash2 size={11} strokeWidth={2} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <form
              className="widget-task-add"
              onSubmit={(e) => {
                e.preventDefault();
                void addTask();
              }}
            >
              <Plus size={13} strokeWidth={2} />
              <input
                className="widget-task-add__input"
                placeholder="Add a task…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </form>
          </>
        )}
      </div>
    </div>
  );
}
