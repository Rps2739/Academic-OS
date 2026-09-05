import { useEffect, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { CalendarDays, ListTodo, FileText, Check, X as XIcon, ArrowRight } from "lucide-react";

interface HomeViewProps {
  localDb: SqliteLocalDb;
  userId: string;
  onChanged: () => void;
  onOpenNote: (node: LocalRow) => void;
  onGoToView: (view: "tasks" | "timetable") => void;
  refreshSignal: number;
}

interface TodaySession {
  id: string;
  starts_at: string;
  ends_at: string;
  subject_label: string;
  faculty: string | null;
  subject_id: string | null;
  attendance_id: string | null;
  attendance_state: "present" | "absent" | null;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Home — the thing the nav rail was missing: a single glanceable screen
 * instead of switching tabs to see "what's today, what's due, what did
 * I last write". Also where today's attendance gets marked in passing,
 * since that's the moment it's actually top of mind.
 */
export function HomeView({ localDb, userId, onChanged, onOpenNote, onGoToView, refreshSignal }: HomeViewProps) {
  const [sessions, setSessions] = useState<TodaySession[]>([]);
  const [tasksDue, setTasksDue] = useState<LocalRow[]>([]);
  const [recentNotes, setRecentNotes] = useState<LocalRow[]>([]);

  async function refresh() {
    const sessionRows = await localDb.raw.select<Record<string, unknown>[]>(
      `SELECT * FROM class_sessions
       WHERE date(starts_at) = date('now', 'localtime') AND status NOT IN ('cancelled', 'superseded') AND deleted_at IS NULL
       ORDER BY starts_at ASC`
    );
    const marks = await localDb.raw.select<Record<string, unknown>[]>(
      `SELECT * FROM attendance_marks WHERE deleted_at IS NULL AND marked_for = date('now', 'localtime')`
    );
    const markBySession = new Map(marks.map((m) => [m["class_session_id"] as string, m]));
    setSessions(
      sessionRows.map((s) => {
        const mark = markBySession.get(s["id"] as string);
        return {
          id: s["id"] as string,
          starts_at: s["starts_at"] as string,
          ends_at: s["ends_at"] as string,
          subject_label: s["subject_label"] as string,
          faculty: s["faculty"] as string | null,
          subject_id: s["subject_id"] as string | null,
          attendance_id: (mark?.["id"] as string | undefined) ?? null,
          attendance_state: (mark?.["state"] as "present" | "absent" | undefined) ?? null,
        };
      })
    );

    const taskRows = await localDb.raw.select<Record<string, unknown>[]>(
      `SELECT * FROM tasks WHERE status = 'open' AND deleted_at IS NULL AND due_at IS NOT NULL
       AND due_at <= datetime('now', '+7 days')
       ORDER BY due_at ASC LIMIT 8`
    );
    setTasksDue(taskRows as LocalRow[]);

    // Explicitly aliased rather than relying on n.updated_at (the node's
    // own updated_at only reflects rename/move, not a content edit) —
    // sort and display need to agree on which "last edited" they mean.
    const noteRows = await localDb.raw.select<Record<string, unknown>[]>(
      `SELECT n.*, pb.updated_at AS content_updated_at FROM nodes n JOIN page_bodies pb ON pb.node_id = n.id
       WHERE n.kind = 'page' AND n.deleted_at IS NULL
       ORDER BY pb.updated_at DESC LIMIT 6`
    );
    setRecentNotes(noteRows as LocalRow[]);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  async function markAttendance(session: TodaySession, state: "present" | "absent") {
    if (!session.subject_id) return;
    const clearing = session.attendance_state === state;
    if (session.attendance_id) {
      await localDb.put("attendance_marks", {
        id: session.attendance_id,
        user_id: userId,
        deleted_at: clearing ? new Date().toISOString() : null,
        state,
      });
    } else if (!clearing) {
      await localDb.put("attendance_marks", {
        id: crypto.randomUUID(),
        user_id: userId,
        subject_id: session.subject_id,
        class_session_id: session.id,
        marked_for: session.starts_at.slice(0, 10),
        state,
      });
    }
    await refresh();
    onChanged();
  }

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="home-view">
      <h1 className="home-view__greeting">{today}</h1>

      <div className="home-view__grid">
        <section className="home-card">
          <div className="home-card__head">
            <h2>
              <CalendarDays size={15} strokeWidth={2} /> Today's classes
            </h2>
            <button className="home-card__link" onClick={() => onGoToView("timetable")}>
              Archive <ArrowRight size={12} strokeWidth={2} />
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="home-card__empty">No classes today.</p>
          ) : (
            <ul className="home-card__list">
              {sessions.map((s) => (
                <li key={s.id} className="home-session">
                  <span className="home-session__time">{fmtTime(s.starts_at)}</span>
                  <span className="home-session__subject">{s.subject_label}</span>
                  {s.faculty && <span className="home-session__faculty">{s.faculty}</span>}
                  {s.subject_id && (
                    <span className="home-session__attendance">
                      <button
                        className={`subject-session-row__mark subject-session-row__mark--present ${
                          s.attendance_state === "present" ? "subject-session-row__mark--active" : ""
                        }`}
                        title="Mark present"
                        onClick={() => void markAttendance(s, "present")}
                      >
                        <Check size={11} strokeWidth={2.5} />
                      </button>
                      <button
                        className={`subject-session-row__mark subject-session-row__mark--absent ${
                          s.attendance_state === "absent" ? "subject-session-row__mark--active" : ""
                        }`}
                        title="Mark absent"
                        onClick={() => void markAttendance(s, "absent")}
                      >
                        <XIcon size={11} strokeWidth={2.5} />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="home-card">
          <div className="home-card__head">
            <h2>
              <ListTodo size={15} strokeWidth={2} /> Due this week
            </h2>
            <button className="home-card__link" onClick={() => onGoToView("tasks")}>
              All tasks <ArrowRight size={12} strokeWidth={2} />
            </button>
          </div>
          {tasksDue.length === 0 ? (
            <p className="home-card__empty">Nothing due in the next 7 days.</p>
          ) : (
            <ul className="home-card__list">
              {tasksDue.map((t) => (
                <li key={t.id as string} className="home-task">
                  <span className="home-task__title">{t["title"] as string}</span>
                  <span className="home-task__due">
                    {new Date(t["due_at"] as string).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="home-card">
          <div className="home-card__head">
            <h2>
              <FileText size={15} strokeWidth={2} /> Recently edited
            </h2>
          </div>
          {recentNotes.length === 0 ? (
            <p className="home-card__empty">No notes yet.</p>
          ) : (
            <ul className="home-card__list">
              {recentNotes.map((n) => (
                <li key={n.id as string} className="home-note" onClick={() => onOpenNote(n)}>
                  <span className="home-note__title">{n["title"] as string}</span>
                  <span className="home-note__time">{relativeTime(n["content_updated_at"] as string)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
