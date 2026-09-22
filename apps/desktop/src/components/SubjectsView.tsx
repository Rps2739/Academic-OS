import { useEffect, useMemo, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Plus,
  Check,
  X as XIcon,
  FolderOpen,
  Briefcase,
  Pencil,
  Trash2,
  BadgeCheck,
  CalendarOff,
} from "lucide-react";

interface SubjectsViewProps {
  localDb: SqliteLocalDb;
  userId: string;
  onChanged: () => void;
  onOpenFolder: (nodeId: string) => void;
  onGoToView: (view: "projects") => void;
  onNotify: (message: string, undo: () => void) => void;
}

interface SessionRow {
  id: string;
  starts_at: string;
  subject_label: string;
  attendance_state: "present" | "absent" | "od" | "cancelled" | null;
  attendance_mark_id: string | null;
}

const UNASSIGNED = "Unassigned";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Sorts term labels with any leading number treated numerically ("Sem 2" before "Sem 10"),
 * falling back to plain string order; Unassigned always sorts last. */
function compareTerms(a: string, b: string): number {
  if (a === UNASSIGNED) return 1;
  if (b === UNASSIGNED) return -1;
  const numA = a.match(/\d+/);
  const numB = b.match(/\d+/);
  if (numA && numB) return Number(numA[0]) - Number(numB[0]);
  return a.localeCompare(b);
}

/**
 * Subjects + attendance. `subjects` and `attendance_marks` were fully
 * built into the schema/sync layer from early on but never had a UI —
 * this is that UI. Existing class_sessions were imported with
 * subject_id always null (the timetable pipelines never resolved it),
 * so "Sync from timetable" both creates a Subject per distinct
 * subject_label seen and backfills subject_id on every matching
 * session — past and future — in one pass.
 *
 * Subjects group by `term` (e.g. "Sem 3") so an old semester's subjects
 * don't sit mixed in with the current one. `term` isn't derivable from
 * the timetable data itself (no semester calendar exists anywhere in
 * the schema), so it's set once per sync batch (prompted) and editable
 * per-subject after the fact, to let old ungrouped subjects be sorted in.
 */
export function SubjectsView({ localDb, userId, onChanged, onOpenFolder, onGoToView, onNotify }: SubjectsViewProps) {
  const [subjects, setSubjects] = useState<LocalRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sessionsBySubject, setSessionsBySubject] = useState<Record<string, SessionRow[]>>({});
  const [projectsBySubject, setProjectsBySubject] = useState<Record<string, LocalRow[]>>({});
  const [syncing, setSyncing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);

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

  const knownTerms = useMemo(() => {
    const terms = new Set<string>();
    for (const s of subjects) {
      const term = s["term"] as string | null;
      if (term) terms.add(term);
    }
    return [...terms].sort(compareTerms);
  }, [subjects]);

  const grouped = useMemo(() => {
    const map = new Map<string, LocalRow[]>();
    for (const s of subjects) {
      const term = (s["term"] as string | null) || UNASSIGNED;
      if (!map.has(term)) map.set(term, []);
      map.get(term)!.push(s);
    }
    return [...map.entries()].sort((a, b) => compareTerms(a[0], b[0]));
  }, [subjects]);

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
      //
      // Only discover from RECENT sessions (last ~150 days, plus anything
      // upcoming). Without this window, every subject the timetable had
      // ever mentioned — including a whole previous semester's courses
      // still sitting in class_sessions history — got pulled in as "new",
      // which is exactly the "it keeps re-adding Sem 1 subjects" bug. A
      // running semester's own subjects always have recent/future
      // sessions, so a tight window still finds all of them while
      // excluding last semester's. 150 days ≈ one semester's span.
      const discoverySince = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString();
      const distinct = await localDb.raw.select<{ subject_label: string; faculty: string | null }[]>(
        `SELECT DISTINCT subject_label, faculty FROM class_sessions
         WHERE deleted_at IS NULL AND session_type IS NOT NULL AND starts_at >= $1`,
        [discoverySince]
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

      const toCreate = distinct.filter((row) => !known.has(row.subject_label.toLowerCase()));

      // Ask which semester any newly-discovered subjects belong to, so
      // they don't land bucketed with an older semester's subjects that
      // are still sitting in class_sessions history. Cancelling just
      // leaves them Unassigned — sortable in later by hand.
      let newTerm: string | null = null;
      if (toCreate.length > 0) {
        const suggestion = knownTerms[knownTerms.length - 1] ?? "";
        const answer = window.prompt(
          `Found ${toCreate.length} new subject${toCreate.length === 1 ? "" : "s"} in the timetable.\n` +
            `Which semester are they for? (e.g. "Sem 3") Leave blank to leave unassigned.`,
          suggestion
        );
        newTerm = answer?.trim() || null;
      }

      let created = 0;
      for (const row of toCreate) {
        const key = row.subject_label.toLowerCase();
        const id = crypto.randomUUID();
        await localDb.put("subjects", {
          id,
          user_id: userId,
          name: row.subject_label,
          code: null,
          term: newTerm,
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

  async function setTerm(subject: LocalRow, term: string) {
    await localDb.put("subjects", { id: subject.id as string, user_id: userId, term: term.trim() || null });
    setEditingTermId(null);
    await refresh();
    onChanged();
  }

  async function saveSubjectEdit(subject: LocalRow, name: string, code: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    await localDb.put("subjects", {
      id: subject.id as string,
      user_id: userId,
      name: trimmedName,
      code: code.trim() || null,
    });
    setEditingSubjectId(null);
    await refresh();
    onChanged();
  }

  /** Deleting a subject unlinks (rather than deletes) everything that pointed
   * at it — class_sessions and projects go back to subject_id = null so they
   * can be correctly re-matched later, attendance_marks are soft-deleted
   * (their subject_id can't be null per schema) — then soft-deletes the
   * subject itself. Undo restores all of it in one shot, same "id"s reused,
   * since the "before" state for every unlinked row was simply this subject's
   * own id.
   *
   * The old mixed-semester "sync from timetable" bug meant some subjects
   * (e.g. ones that had accumulated a full old semester's history) can have
   * hundreds of linked class_sessions. Looping put() one row at a time over
   * that many rows meant one Tauri IPC round-trip per row — slow enough to
   * look like the delete had silently failed. These go through localDb.raw
   * as single bulk UPDATE statements instead, manually setting dirty=1 so
   * the sync engine still picks them up (the one deliberate exception to
   * "writes go through put()", justified by row count here). */
  async function deleteSubject(subject: LocalRow) {
    const subjectId = subject.id as string;
    const now = new Date().toISOString();

    const sessions = await localDb.raw.select<{ id: string }[]>(
      "SELECT id FROM class_sessions WHERE subject_id = $1 AND deleted_at IS NULL",
      [subjectId]
    );
    const marks = await localDb.raw.select<{ id: string }[]>(
      "SELECT id FROM attendance_marks WHERE subject_id = $1 AND deleted_at IS NULL",
      [subjectId]
    );
    const linkedProjects = await localDb.raw.select<{ id: string }[]>(
      "SELECT id FROM projects WHERE subject_id = $1 AND deleted_at IS NULL",
      [subjectId]
    );

    await localDb.raw.execute(
      "UPDATE class_sessions SET subject_id = NULL, updated_at = $1, dirty = 1 WHERE subject_id = $2 AND deleted_at IS NULL",
      [now, subjectId]
    );
    await localDb.raw.execute(
      "UPDATE attendance_marks SET deleted_at = $1, updated_at = $1, dirty = 1 WHERE subject_id = $2 AND deleted_at IS NULL",
      [now, subjectId]
    );
    await localDb.raw.execute(
      "UPDATE projects SET subject_id = NULL, updated_at = $1, dirty = 1 WHERE subject_id = $2 AND deleted_at IS NULL",
      [now, subjectId]
    );
    await localDb.put("subjects", { id: subjectId, user_id: userId, deleted_at: now });

    await refresh();
    onChanged();
    onNotify(`Deleted "${subject["name"] as string}"`, () =>
      void undoDeleteSubject(
        subjectId,
        sessions.map((s) => s.id),
        marks.map((m) => m.id),
        linkedProjects.map((p) => p.id)
      )
    );
  }

  async function undoDeleteSubject(subjectId: string, sessionIds: string[], markIds: string[], projectIds: string[]) {
    const now = new Date().toISOString();
    await localDb.put("subjects", { id: subjectId, user_id: userId, deleted_at: null });
    await bulkRestore("class_sessions", "subject_id", subjectId, sessionIds, now);
    await bulkRestore("attendance_marks", "deleted_at", null, markIds, now);
    await bulkRestore("projects", "subject_id", subjectId, projectIds, now);
    await refresh();
    onChanged();
  }

  /** Sets one column back to `value` for every id in `ids`, in a single
   * statement — the undo-side counterpart to deleteSubject's bulk updates. */
  async function bulkRestore(
    table: "class_sessions" | "attendance_marks" | "projects",
    column: string,
    value: string | null,
    ids: string[],
    now: string
  ): Promise<void> {
    if (ids.length === 0) return;
    const idPlaceholders = ids.map((_, i) => `$${i + 3}`).join(", ");
    await localDb.raw.execute(
      `UPDATE ${table} SET ${column} = $1, updated_at = $2, dirty = 1 WHERE id IN (${idPlaceholders})`,
      [value, now, ...ids]
    );
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
        attendance_state: (mark?.["state"] as "present" | "absent" | "od" | "cancelled" | undefined) ?? null,
        attendance_mark_id: (mark?.["id"] as string | undefined) ?? null,
      };
    });
    setSessionsBySubject((prev) => ({ ...prev, [subjectId]: rows }));
  }

  async function loadProjects(subjectId: string) {
    const rows = await localDb.raw.select<Record<string, unknown>[]>(
      `SELECT * FROM projects WHERE subject_id = $1 AND deleted_at IS NULL
       ORDER BY (deadline IS NULL), deadline ASC, name ASC`,
      [subjectId]
    );
    setProjectsBySubject((prev) => ({ ...prev, [subjectId]: rows as LocalRow[] }));
  }

  // Independent per-card expand/collapse — a set, not a single id, so
  // opening one subject's attendance history no longer silently closes
  // whichever other one was already open.
  function toggleExpanded(subjectId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) {
        next.delete(subjectId);
      } else {
        next.add(subjectId);
        if (!sessionsBySubject[subjectId]) void loadSessions(subjectId);
        if (!projectsBySubject[subjectId]) void loadProjects(subjectId);
      }
      return next;
    });
  }

  async function openFolder(subject: LocalRow) {
    let nodeId = subject["node_id"] as string | null;
    if (!nodeId) {
      const term = (subject["term"] as string | null) || UNASSIGNED;
      nodeId = await localDb.findOrCreateFolderPath(userId, ["SIBM", term, subject["name"] as string]);
      await localDb.put("subjects", { id: subject.id as string, user_id: userId, node_id: nodeId });
      await refresh();
      onChanged();
    }
    onOpenFolder(nodeId);
  }

  async function markAttendance(
    subjectId: string,
    session: SessionRow,
    state: "present" | "absent" | "od" | "cancelled"
  ) {
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
    // "cancelled" (the class didn't happen) counts toward neither side —
    // excluded from the denominator entirely. "od" (on-duty) counts as
    // present, per standard college attendance policy.
    const marked = rows.filter((r) => r.attendance_state !== null && r.attendance_state !== "cancelled");
    if (marked.length === 0) return null;
    const present = marked.filter((r) => r.attendance_state === "present" || r.attendance_state === "od").length;
    return Math.round((present / marked.length) * 100);
  }

  return (
    <div className="subjects-view">
      <datalist id="subject-term-options">
        {knownTerms.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
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
        grouped.map(([term, termSubjects]) => (
          <section key={term} className="subjects-view__term-group">
            <h2 className="subjects-view__term-heading">{term}</h2>
            <ul className="subjects-view__list">
              {termSubjects.map((subject) => {
                const isExpanded = expandedIds.has(subject.id as string);
                const pct = attendancePct(subject.id as string);
                const isEditingTerm = editingTermId === (subject.id as string);
                const isEditingSubject = editingSubjectId === (subject.id as string);
                return (
                  <li key={subject.id as string} className="subject-card">
                    <div className="subject-card__header">
                      {isEditingSubject ? (
                        <form
                          className="subject-card__edit-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const els = e.currentTarget.elements;
                            const name = (els.namedItem("name") as HTMLInputElement).value;
                            const code = (els.namedItem("code") as HTMLInputElement).value;
                            void saveSubjectEdit(subject, name, code);
                          }}
                        >
                          <input
                            name="name"
                            autoFocus
                            className="subject-card__edit-name"
                            defaultValue={subject["name"] as string}
                            placeholder="Subject name"
                          />
                          <input
                            name="code"
                            className="subject-card__edit-code"
                            defaultValue={(subject["code"] as string | null) ?? ""}
                            placeholder="Code (optional)"
                          />
                          <button type="submit" className="btn btn--primary btn--sm">
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setEditingSubjectId(null)}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <button
                            className="subject-card__toggle"
                            onClick={() => toggleExpanded(subject.id as string)}
                          >
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
                          <button
                            className="icon-btn"
                            title="Edit subject"
                            onClick={() => setEditingSubjectId(subject.id as string)}
                          >
                            <Pencil size={13} strokeWidth={2} />
                          </button>
                          <button
                            className="icon-btn"
                            title="Open notes folder"
                            onClick={() => void openFolder(subject)}
                          >
                            <FolderOpen size={13} strokeWidth={2} />
                          </button>
                          <button
                            className="icon-btn icon-btn--danger"
                            title="Delete subject"
                            onClick={() => void deleteSubject(subject)}
                          >
                            <Trash2 size={13} strokeWidth={2} />
                          </button>
                        </>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="subject-card__body">
                        {isEditingTerm ? (
                          <form
                            className="subject-card__term-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const input = e.currentTarget.elements.namedItem("term") as HTMLInputElement;
                              void setTerm(subject, input.value);
                            }}
                          >
                            <input
                              name="term"
                              autoFocus
                              className="subject-card__term-input"
                              list="subject-term-options"
                              defaultValue={(subject["term"] as string | null) ?? ""}
                              placeholder="e.g. Sem 3"
                              onBlur={() => setEditingTermId(null)}
                            />
                          </form>
                        ) : (
                          <button
                            className="subject-card__term-chip"
                            onClick={() => setEditingTermId(subject.id as string)}
                          >
                            {(subject["term"] as string | null) || "Set semester…"}
                          </button>
                        )}

                        <div className="subject-card__sessions">
                          {!sessionsBySubject[subject.id as string] ? (
                            <p className="subjects-view__loading">Loading attendance history…</p>
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
                                <button
                                  className={`subject-session-row__mark subject-session-row__mark--od ${
                                    s.attendance_state === "od" ? "subject-session-row__mark--active" : ""
                                  }`}
                                  title="Mark on-duty (OD) — counts as present"
                                  onClick={() => void markAttendance(subject.id as string, s, "od")}
                                >
                                  <BadgeCheck size={12} strokeWidth={2.5} />
                                </button>
                                <button
                                  className={`subject-session-row__mark subject-session-row__mark--cancelled ${
                                    s.attendance_state === "cancelled" ? "subject-session-row__mark--active" : ""
                                  }`}
                                  title="Mark class cancelled — excluded from attendance %"
                                  onClick={() => void markAttendance(subject.id as string, s, "cancelled")}
                                >
                                  <CalendarOff size={12} strokeWidth={2.5} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="subject-card__projects">
                          <h4 className="subject-card__projects-heading">
                            <Briefcase size={12} strokeWidth={2} />
                            Projects & deadlines
                          </h4>
                          {!projectsBySubject[subject.id as string] ? (
                            <p className="subjects-view__loading">Loading…</p>
                          ) : projectsBySubject[subject.id as string]!.length === 0 ? (
                            <p className="subjects-view__loading">
                              No projects linked yet — link one from the Projects tab.
                            </p>
                          ) : (
                            <ul className="subject-card__project-list">
                              {projectsBySubject[subject.id as string]!.map((p) => (
                                <li key={p.id as string} className="subject-card__project-row">
                                  <button className="subject-card__project-link" onClick={() => onGoToView("projects")}>
                                    {p["name"] as string}
                                  </button>
                                  {(p["deadline"] as string | null) && (
                                    <span className="subject-card__project-deadline">
                                      {new Date(p["deadline"] as string).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                      })}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
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
