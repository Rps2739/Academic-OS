import { useEffect, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { CalendarDays, ListTodo, FileText, Check, X as XIcon, ArrowRight, BadgeCheck, CalendarOff } from "lucide-react";
import { relativeTime } from "../lib/format";
import { formatSessionDay, formatSessionTime, TODAY_SESSIONS_SQL, UPCOMING_EVENTS_SQL } from "../lib/schedule";
import { autoLinkSessions } from "../lib/subject-link";

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
  attendance_state: "present" | "absent" | "od" | "cancelled" | null;
}

/**
 * Home — the thing the nav rail was missing: a single glanceable screen
 * instead of switching tabs to see "what's today, what's due, what did
 * I last write". Also where today's attendance gets marked in passing,
 * since that's the moment it's actually top of mind.
 */
export function HomeView({ localDb, userId, onChanged, onOpenNote, onGoToView, refreshSignal }: HomeViewProps) {
  const [sessions, setSessions] = useState<TodaySession[]>([]);
  const [upcoming, setUpcoming] = useState<LocalRow[]>([]);
  const [tasksDue, setTasksDue] = useState<LocalRow[]>([]);
  const [recentNotes, setRecentNotes] = useState<LocalRow[]>([]);

  async function refresh() {
    // A freshly imported week arrives with subject_id unset, which hides
    // the attendance buttons below. Link it before reading. Only ever finds
    // work once per new week, so the sync this triggers can't loop.
    if ((await autoLinkSessions(localDb)) > 0) onChanged();
    const sessionRows = await localDb.raw.select<Record<string, unknown>[]>(TODAY_SESSIONS_SQL);
    setUpcoming((await localDb.raw.select<Record<string, unknown>[]>(UPCOMING_EVENTS_SQL)) as LocalRow[]);
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
          attendance_state: (mark?.["state"] as "present" | "absent" | "od" | "cancelled" | undefined) ?? null,
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

  async function markAttendance(session: TodaySession, state: "present" | "absent" | "od" | "cancelled") {
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
              <CalendarDays size={15} strokeWidth={2} /> Today's schedule
            </h2>
            <button className="home-card__link" onClick={() => onGoToView("timetable")}>
              Archive <ArrowRight size={12} strokeWidth={2} />
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="home-card__empty">Nothing scheduled today.</p>
          ) : (
            <ul className="home-card__list">
              {sessions.map((s) => (
                <li key={s.id} className="home-session">
                  <span className="home-session__time">{formatSessionTime(s.starts_at, s.ends_at)}</span>
                  <span className="home-session__main">
                    <span className="home-session__subject">{s.subject_label}</span>
                    {s.faculty && <span className="home-session__faculty">{s.faculty}</span>}
                  </span>
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
                      <button
                        className={`subject-session-row__mark subject-session-row__mark--od ${
                          s.attendance_state === "od" ? "subject-session-row__mark--active" : ""
                        }`}
                        title="Mark on-duty (OD) — counts as present"
                        onClick={() => void markAttendance(s, "od")}
                      >
                        <BadgeCheck size={11} strokeWidth={2.5} />
                      </button>
                      <button
                        className={`subject-session-row__mark subject-session-row__mark--cancelled ${
                          s.attendance_state === "cancelled" ? "subject-session-row__mark--active" : ""
                        }`}
                        title="Mark class cancelled — excluded from attendance %"
                        onClick={() => void markAttendance(s, "cancelled")}
                      >
                        <CalendarOff size={11} strokeWidth={2.5} />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {upcoming.length > 0 && (
            <>
              <h3 className="home-card__subhead">Next 7 days</h3>
              <ul className="home-card__list">
                {upcoming.map((e) => (
                  <li key={e.id as string} className="home-session">
                    <span className="home-session__day">{formatSessionDay(e["starts_at"] as string)}</span>
                    <span className="home-session__time">
                      {formatSessionTime(e["starts_at"] as string, e["ends_at"] as string)}
                    </span>
                    <span className="home-session__main">
                      <span className="home-session__subject">{e["subject_label"] as string}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
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
