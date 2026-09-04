import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import type { LocalRow } from "@academic-os/core";
import { useWidgetData } from "./useWidgetData";

const POLL_MS = 20_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Today's classes. Reads class_sessions, which stays empty until the
 * timetable pipeline (design manual Phase 4) exists — this widget is
 * fully ready for that data, it just has nothing to show yet.
 */
export function ClassesWidget() {
  const { localDb, loading } = useWidgetData();
  const [sessions, setSessions] = useState<LocalRow[]>([]);

  async function refresh() {
    if (!localDb) return;
    const rows = await localDb.raw.select<Record<string, unknown>[]>(
      `SELECT * FROM class_sessions
       WHERE date(starts_at) = date('now', 'localtime') AND status != 'cancelled' AND deleted_at IS NULL
       ORDER BY starts_at ASC`
    );
    setSessions(rows as LocalRow[]);
  }

  useEffect(() => {
    if (!localDb) return;
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDb]);

  return (
    <div className="widget-panel">
      <div className="widget-panel__header" data-tauri-drag-region>
        <CalendarDays size={13} strokeWidth={2} />
        <span>Today</span>
      </div>
      <div className="widget-panel__body">
        {loading ? (
          <p className="widget-panel__empty">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="widget-panel__empty">No classes today.</p>
        ) : (
          <ul className="widget-panel__list">
            {sessions.map((s) => (
              <li key={s.id as string} className="widget-class">
                <span className="widget-class__time">{formatTime(s["starts_at"] as string)}</span>
                <span className="widget-class__subject">{s["subject_label"] as string}</span>
                {s["room"] ? <span className="widget-class__room">{s["room"] as string}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
