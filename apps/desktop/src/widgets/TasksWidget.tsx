import { useEffect, useState } from "react";
import { ListTodo, Check } from "lucide-react";
import type { LocalRow } from "@academic-os/core";
import { useWidgetData } from "./useWidgetData";

const POLL_MS = 20_000; // picks up changes the main window's sync loop pulls in

/** Always-on-top desktop panel (design manual §2.2/"the Windows widget compromise"). */
export function TasksWidget() {
  const { userId, localDb, loading } = useWidgetData();
  const [tasks, setTasks] = useState<LocalRow[]>([]);

  async function refresh() {
    if (!localDb) return;
    const rows = await localDb.raw.select<Record<string, unknown>[]>(
      `SELECT * FROM tasks WHERE status = 'open' AND deleted_at IS NULL
       ORDER BY due_at IS NULL, due_at ASC, priority DESC, sort_order ASC LIMIT 12`
    );
    setTasks(rows as LocalRow[]);
  }

  useEffect(() => {
    if (!localDb) return;
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDb]);

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

  return (
    <div className="widget-panel">
      <div className="widget-panel__header" data-tauri-drag-region>
        <ListTodo size={13} strokeWidth={2} />
        <span>Tasks</span>
      </div>
      <div className="widget-panel__body">
        {loading ? (
          <p className="widget-panel__empty">Loading…</p>
        ) : !userId ? (
          <p className="widget-panel__empty">Sign in from the main window.</p>
        ) : tasks.length === 0 ? (
          <p className="widget-panel__empty">Nothing open. Nice.</p>
        ) : (
          <ul className="widget-panel__list">
            {tasks.map((t) => (
              <li key={t.id as string} className="widget-task">
                <button className="widget-task__check" onClick={() => void toggleDone(t)} title="Mark done">
                  <Check size={10} strokeWidth={3} />
                </button>
                <span className="widget-task__title">{t["title"] as string}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
