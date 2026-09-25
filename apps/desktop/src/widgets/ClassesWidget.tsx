import { useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2, Pencil, X } from "lucide-react";
import type { LocalRow } from "@academic-os/core";
import { useWidgetData } from "./useWidgetData";
import { WidgetHeader } from "./WidgetHeader";
import { formatSessionDay, formatSessionTime, TODAY_SESSIONS_SQL, UPCOMING_EVENTS_SQL } from "../lib/schedule";

const POLL_MS = 20_000;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Combines a YYYY-MM-DD date string with an HH:MM time into a local ISO
 * instant — lets the add/edit form schedule a class for any day (e.g.
 * tomorrow), not just today, while the widget's own list stays scoped to
 * "today" per its name/purpose. */
function dateAtTime(dateStr: string, hhmm: string): string {
  const [y, mo, da] = dateStr.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(y, (mo ?? 1) - 1, da ?? 1, h, m, 0, 0);
  return d.toISOString();
}

/** YYYY-MM-DD in local time, for pre-filling the date field when editing an
 * existing session (its starts_at, not necessarily today). */
function dateStrOf(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeStrOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
 *
 * The form can schedule a session for any date (not just today) so a class
 * for tomorrow can be queued in advance — the list below still only shows
 * today's sessions, matching the widget's own "Today" scope; a
 * tomorrow-dated entry simply appears here once that day arrives.
 */
export function ClassesWidget() {
  const { userId, localDb, loading } = useWidgetData();
  const [sessions, setSessions] = useState<LocalRow[]>([]);
  const [upcoming, setUpcoming] = useState<LocalRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDurationMs, setEditingDurationMs] = useState(DEFAULT_DURATION_MS);
  const [subject, setSubject] = useState("");
  const [time, setTime] = useState("09:00");
  const [room, setRoom] = useState("");
  const [dateStr, setDateStr] = useState(todayDateStr());

  async function refresh() {
    if (!localDb) return;
    const rows = await localDb.raw.select<Record<string, unknown>[]>(TODAY_SESSIONS_SQL);
    setSessions(rows as LocalRow[]);
    const next = await localDb.raw.select<Record<string, unknown>[]>(UPCOMING_EVENTS_SQL);
    setUpcoming(next as LocalRow[]);
  }

  useEffect(() => {
    if (!localDb) return;
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDb]);

  function openAddForm() {
    setEditingId(null);
    setEditingDurationMs(DEFAULT_DURATION_MS);
    setSubject("");
    setRoom("");
    setTime("09:00");
    setDateStr(todayDateStr());
    setFormOpen(true);
  }

  function openEditForm(session: LocalRow) {
    setEditingId(session.id as string);
    setSubject((session["subject_label"] as string) ?? "");
    setRoom((session["room"] as string) ?? "");
    const startsAt = session["starts_at"] as string;
    setTime(timeStrOf(startsAt));
    setDateStr(dateStrOf(startsAt));
    // Keep the entry's real length — a 30-minute event, or anything pulled
    // from Google Calendar, shouldn't silently become an hour long just
    // because its title or time was edited here (the edit syncs back).
    const duration = new Date(session["ends_at"] as string).getTime() - new Date(startsAt).getTime();
    setEditingDurationMs(duration > 0 ? duration : DEFAULT_DURATION_MS);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setSubject("");
    setRoom("");
  }

  async function saveSession() {
    const label = subject.trim();
    if (!label || !localDb || !userId) return;
    const startsAt = dateAtTime(dateStr, time);
    const endsAt = new Date(new Date(startsAt).getTime() + editingDurationMs).toISOString();

    if (editingId) {
      await localDb.put("class_sessions", {
        id: editingId,
        user_id: userId,
        starts_at: startsAt,
        ends_at: endsAt,
        subject_label: label,
        room: room.trim() || null,
      });
    } else {
      await localDb.put("class_sessions", {
        id: crypto.randomUUID(),
        user_id: userId,
        import_id: null, // manually entered, not from the (not-yet-built) timetable pipeline
        week_start: mondayOf(new Date(dateStr)),
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
    }
    closeForm();
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

  function renderRow(s: LocalRow, withDay: boolean) {
    const startsAt = s["starts_at"] as string;
    return (
      <li key={s.id as string} className="widget-class">
        <span className="widget-class__time">
          {withDay && <span className="widget-class__day">{formatSessionDay(startsAt)}</span>}
          {formatSessionTime(startsAt, s["ends_at"] as string)}
        </span>
        <span className="widget-class__subject">{s["subject_label"] as string}</span>
        {s["room"] ? <span className="widget-class__room">{s["room"] as string}</span> : null}
        <button className="widget-task__edit" title="Edit" onClick={() => openEditForm(s)}>
          <Pencil size={11} strokeWidth={2} />
        </button>
        <button className="widget-task__delete" title="Delete" onClick={() => void deleteSession(s)}>
          <Trash2 size={11} strokeWidth={2} />
        </button>
      </li>
    );
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
              <p className="widget-panel__empty">Nothing scheduled today.</p>
            ) : (
              <ul className="widget-panel__list">{sessions.map((s) => renderRow(s, false))}</ul>
            )}
            {upcoming.length > 0 && (
              <>
                <p className="widget-panel__section-label">Next 7 days</p>
                <ul className="widget-panel__list">{upcoming.map((s) => renderRow(s, true))}</ul>
              </>
            )}
            {formOpen ? (
              <form
                className="widget-class-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveSession();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeForm();
                  }
                }}
              >
                <div className="widget-class-add__row">
                  <input
                    className="widget-class-add__date"
                    type="date"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    title="Date"
                  />
                  <input
                    className="widget-class-add__time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="widget-class-add__row">
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
                  <button type="submit" className="icon-btn" title={editingId ? "Save" : "Add"}>
                    <Plus size={13} strokeWidth={2} />
                  </button>
                  <button type="button" className="icon-btn" title="Cancel" onClick={closeForm}>
                    <X size={13} strokeWidth={2} />
                  </button>
                </div>
              </form>
            ) : (
              <button className="widget-task-add" onClick={openAddForm}>
                <Plus size={13} strokeWidth={2} />
                <span className="widget-task-add__input">Add a class or event…</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
