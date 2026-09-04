import { useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import type { LocalRow } from "@academic-os/core";
import { useWidgetData } from "./useWidgetData";
import { WidgetHeader } from "./WidgetHeader";

const POLL_MS = 20_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function todayIsoAt(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Today's classes — reads class_sessions, the same table the timetable
 * pipeline (design manual Phase 4) will populate automatically once
 * built. Until then, this add/edit/delete form lets today's schedule be
 * entered by hand rather than leaving the panel permanently empty.
 */
export function ClassesWidget() {
  const { userId, localDb, loading } = useWidgetData();
  const [sessions, setSessions] = useState<LocalRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [subject, setSubject] = useState("");
  const [time, setTime] = useState("09:00");
  const [room, setRoom] = useState("");

  async function refresh() {
    if (!localDb) return;
    const rows = await localDb.raw.select<Record<string, unknown>[]>(
      `SELECT * FROM class_sessions
       WHERE date(starts_at) = date('now', 'localtime') AND status NOT IN ('cancelled', 'superseded') AND deleted_at IS NULL
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

  async function addSession() {
    const label = subject.trim();
    if (!label || !localDb || !userId) return;
    const startsAt = todayIsoAt(time);
    const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();
    await localDb.put("class_sessions", {
      id: crypto.randomUUID(),
      user_id: userId,
      import_id: null, // manually entered, not from the (not-yet-built) timetable pipeline
      week_start: mondayOf(new Date()),
      starts_at: startsAt,
      ends_at: endsAt,
      subject_id: null,
      subject_label: label,
      faculty: null,
      room: room.trim() || null,
      session_type: null,
      status: "scheduled",
      gcal_event_id: null,
    });
    setSubject("");
    setRoom("");
    setAdding(false);
    await refresh();
  }

  async function deleteSession(session: LocalRow) {
    if (!localDb || !userId) return;
    await localDb.put("class_sessions", {
      id: session.id as string,
      user_id: userId,
      deleted_at: new Date().toISOString(),
    });
    await refresh();
  }

  return (
    <div className="widget-panel">
      <WidgetHeader icon={<CalendarDays size={13} strokeWidth={2} />} label="Today" />
      <div className="widget-panel__body">
        {loading ? (
          <p className="widget-panel__empty">Loading…</p>
        ) : !userId ? (
          <p className="widget-panel__empty">Sign in from the main window.</p>
        ) : (
          <>
            {sessions.length === 0 ? (
              <p className="widget-panel__empty">No classes today.</p>
            ) : (
              <ul className="widget-panel__list">
                {sessions.map((s) => (
                  <li key={s.id as string} className="widget-class">
                    <span className="widget-class__time">{formatTime(s["starts_at"] as string)}</span>
                    <span className="widget-class__subject">{s["subject_label"] as string}</span>
                    {s["room"] ? <span className="widget-class__room">{s["room"] as string}</span> : null}
                    <button className="widget-task__delete" title="Delete" onClick={() => void deleteSession(s)}>
                      <Trash2 size={11} strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {adding ? (
              <form
                className="widget-class-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addSession();
                }}
              >
                <input
                  className="widget-class-add__time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  autoFocus
                />
                <input
                  className="widget-class-add__subject"
                  placeholder="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <input
                  className="widget-class-add__room"
                  placeholder="Room"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                />
                <button type="submit" className="icon-btn" title="Add">
                  <Plus size={13} strokeWidth={2} />
                </button>
              </form>
            ) : (
              <button className="widget-task-add" onClick={() => setAdding(true)}>
                <Plus size={13} strokeWidth={2} />
                <span className="widget-task-add__input">Add a class…</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
