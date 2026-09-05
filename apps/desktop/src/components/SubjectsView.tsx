import { useEffect, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { BookOpen, ChevronDown, ChevronRight, RefreshCw, Plus, Check, X as XIcon } from "lucide-react";

interface SubjectsViewProps {
  localDb: SqliteLocalDb;
  userId: string;
  onChanged: () => void;
}

interface SessionRow {
  id: string;
  starts_at: string;
  subject_label: string;
  attendance_state: "present" | "absent" | null;
  attendance_mark_id: string | null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Subjects + attendance. `subjects` and `attendance_marks` were fully
 * built into the schema/sync layer from early on but never had a UI —
 * this is that UI. Existing class_sessions were imported with
 * subject_id always null (the timetable pipelines never resolved it),
 * so "Sync from timetable" both creates a Subject per distinct
 * subject_label seen and backfills subject_id on every matching
 * session — past and future — in one pass.
 */
export function SubjectsView({ localDb, userId, onChanged }: SubjectsViewProps) {
  const [subjects, setSubjects] = useState<LocalRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sessionsBySubject, setSessionsBySubject] = useState<Record<string, SessionRow[]>>({});
  const [syncing, setSyncing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");

  async function refresh() {
    const rows = await localDb.raw.select<Record<string, unknown>[]>(
      "SELECT * FROM subjects WHERE deleted_at IS NULL ORDER BY name ASC"
    );
    setSubjects(rows as LocalRow[]);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** One click: discover every real (non-event) subject the timetable has
   * ever mentioned, create a Subject for any not already known (matched
   * by name or an existing alias), then backfill subject_id onto every
   * class_sessions row that matches — including ones imported long
   * before this feature existed. */
  async function syncFromTimetable() {
    setSyncing(true);
    try {
      // A non-null session_type ("Session 20") is what distinguishes a
      // real recurring course from a one-off named event ("Onam
      // Celebration") in the data the parsers already produce — events
      // never carry a session number.
      const distinct = await localDb.raw.select<{ subject_label: string; faculty: string | null }[]>(
        `SELECT DISTINCT subject_label, faculty FROM class_sessions
         WHERE deleted_at IS NULL AND session_type IS NOT NULL`
      );

      const existing = await localDb.raw.select<Record<string, unknown>[]>(
        "SELECT * FROM subjects WHERE deleted_at IS NULL"
      );
      const known = new Map<string, string>(); // lowercased name/alias -> subject id
      for (const s of existing) {
        const id = s["id"] as string;
        known.set((s["name"] as string).toLowerCase(), id);
        for (const alias of (s["aliases"] as string[] | null) ?? []) known.set(alias.toLowerCase(), id);
      }

      let created = 0;
      for (const row of distinct) {
        const key = row.subject_label.toLowerCase();
        if (known.has(key)) continue;
        const id = crypto.randomUUID();
        await localDb.put("subjects", {
          id,
          user_id: userId,
          name: row.subject_label,
          code: null,
          term: null,
          node_id: null,
          aliases: [row.subject_label],
        });
        known.set(key, id);
        created++;
      }

      // Backfill: every session whose label now resolves to a known
      // subject but doesn't have subject_id set yet gets it filled in.
      const unresolved = await localDb.raw.select<{ id: string; subject_label: string }[]>(
        "SELECT id, subject_label FROM class_sessions WHERE deleted_at IS NULL AND subject_id IS NULL"
      );
      let linked = 0;
      for (const session of unresolved) {
        const subjectId = known.get(session.subject_label.toLowerCase());
        if (!subjectId) continue;
        await localDb.put("class_sessions", { id: session.id, user_id: userId, subject_id: subjectId });
        linked++;
      }

      await refresh();
      onChanged();
      window.alert(
        created === 0 && linked === 0
          ? "Already up to date — nothing new found in the timetable."
          : `Added ${created} subject${created === 1 ? "" : "s"}, linked ${linked} class session${linked === 1 ? "" : "s"}.`
      );
    } finally {
      setSyncing(false);
    }
  }

  async function addSubject() {
    const name = draftName.trim();
    if (!name) return;
    await localDb.put("subjects", {
      id: crypto.randomUUID(),
      user_id: userId,
      name,
      code: null,
      term: null,
      node_id: null,
      aliases: [name],
    });
    setDraftName("");
    setAdding(false);
    await refresh();
    onChanged();
  }

  async function loadSessions(subjectId: string) {
    const sessions = await localDb.raw.select<Record<string, unknown>[]>(
      `SELECT id, starts_at, subject_label FROM class_sessions
       WHERE subject_id = $1 AND deleted_at IS NULL AND status != 'superseded' AND starts_at <= $2
       ORDER BY starts_at DESC LIMIT 30`,
      [subjectId, new Date().toISOString()]
    );
    const marks = await localDb.raw.select<Record<string, unknown>[]>(
      "SELECT * FROM attendance_marks WHERE subject_id = $1 AND deleted_at IS NULL",
      [subjectId]
    );
    const markBySession = new Map(marks.map((m) => [m["class_session_id"] as string, m]));

    const rows: SessionRow[] = sessions.map((s) => {
      const mark = markBySession.get(s["id"] as string);
      return {
        id: s["id"] as string,
        starts_at: s["starts_at"] as string,
        subject_label: s["subject_label"] as string,
        attendance_state: (mark?.["state"] as "present" | "absent" | undefined) ?? null,
        attendance_mark_id: (mark?.["id"] as string | undefined) ?? null,
      };
    });
    setSessionsBySubject((prev) => ({ ...prev, [subjectId]: rows }));
  }

  function toggleExpanded(subjectId: string) {
    if (expandedId === subjectId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(subjectId);
    if (!sessionsBySubject[subjectId]) void loadSessions(subjectId);
  }

  async function markAttendance(subjectId: string, session: SessionRow, state: "present" | "absent") {
    // Toggling the same state again clears the mark (soft-delete) —
    // lets a misclick be undone without a separate "clear" control.
    const clearing = session.attendance_state === state;
    if (session.attendance_mark_id) {
      await localDb.put("attendance_marks", {
        id: session.attendance_mark_id,
        user_id: userId,
        deleted_at: clearing ? new Date().toISOString() : null,
        state,
      });
    } else if (!clearing) {
      await localDb.put("attendance_marks", {
        id: crypto.randomUUID(),
        user_id: userId,
        subject_id: subjectId,
        class_session_id: session.id,
        marked_for: session.starts_at.slice(0, 10),
        state,
      });
    }
    await loadSessions(subjectId);
    onChanged();
  }

  function attendancePct(subjectId: string): number | null {
    const rows = sessionsBySubject[subjectId];
    if (!rows) return null;
    const marked = rows.filter((r) => r.attendance_state !== null);
    if (marked.length === 0) return null;
    const present = marked.filter((r) => r.attendance_state === "present").length;
    return Math.round((present / marked.length) * 100);
  }

  return (
    <div className="subjects-view">
      <div className="subjects-view__header">
        <h1 className="subjects-view__title">Subjects</h1>
        <button className="btn btn--secondary" disabled={syncing} onClick={() => void syncFromTimetable()}>
          {syncing ? <span className="spinner" aria-hidden /> : <RefreshCw size={14} strokeWidth={2} />}
          {syncing ? "Syncing…" : "Sync from timetable"}
        </button>
      </div>

      {subjects.length === 0 && !adding ? (
        <p className="subjects-view__empty">
          <BookOpen size={28} strokeWidth={1.5} />
          No subjects yet — click "Sync from timetable" to pull them in from your imported classes, or add one by
          hand below.
        </p>
      ) : (
        <ul className="subjects-view__list">
          {subjects.map((subject) => {
            const isExpanded = expandedId === (subject.id as string);
            const pct = attendancePct(subject.id as string);
            return (
              <li key={subject.id as string} className="subject-card">
                <button className="subject-card__header" onClick={() => toggleExpanded(subject.id as string)}>
                  {isExpanded ? (
                    <ChevronDown size={14} strokeWidth={2} />
                  ) : (
                    <ChevronRight size={14} strokeWidth={2} />
                  )}
                  <span className="subject-card__name">{subject["name"] as string}</span>
                  {(subject["code"] as string | null) && (
                    <span className="subject-card__code">{subject["code"] as string}</span>
                  )}
                  {pct !== null && (
                    <span className={`subject-card__pct ${pct < 75 ? "subject-card__pct--low" : ""}`}>
                      {pct}% attended
                    </span>
                  )}
                </button>
                {isExpanded && (
                  <div className="subject-card__sessions">
                    {!sessionsBySubject[subject.id as string] ? (
                      <p className="subjects-view__loading">Loading…</p>
                    ) : sessionsBySubject[subject.id as string]!.length === 0 ? (
                      <p className="subjects-view__loading">No past sessions recorded for this subject yet.</p>
                    ) : (
                      sessionsBySubject[subject.id as string]!.map((s) => (
                        <div key={s.id} className="subject-session-row">
                          <span className="subject-session-row__date">{fmtDate(s.starts_at)}</span>
                          <button
                            className={`subject-session-row__mark subject-session-row__mark--present ${
                              s.attendance_state === "present" ? "subject-session-row__mark--active" : ""
                            }`}
                            title="Mark present"
                            onClick={() => void markAttendance(subject.id as string, s, "present")}
                          >
                            <Check size={12} strokeWidth={2.5} />
                          </button>
                          <button
                            className={`subject-session-row__mark subject-session-row__mark--absent ${
                              s.attendance_state === "absent" ? "subject-session-row__mark--active" : ""
                            }`}
                            title="Mark absent"
                            onClick={() => void markAttendance(subject.id as string, s, "absent")}
                          >
                            <XIcon size={12} strokeWidth={2.5} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <form
          className="subjects-view__add"
          onSubmit={(e) => {
            e.preventDefault();
            void addSubject();
          }}
        >
          <input
            className="subjects-view__add-input"
            autoFocus
            placeholder="Subject name…"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              if (!draftName.trim()) setAdding(false);
            }}
          />
          <button type="submit" className="btn btn--primary">
            Add
          </button>
        </form>
      ) : (
        <button className="subjects-view__add-trigger" onClick={() => setAdding(true)}>
          <Plus size={13} strokeWidth={2} />
          Add a subject manually
        </button>
      )}
    </div>
  );
}
