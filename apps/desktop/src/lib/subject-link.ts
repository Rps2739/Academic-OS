import type { SqliteLocalDb } from "./sqlite-local-db";

// Home's attendance buttons only render for a class_sessions row with
// subject_id set. Linking used to happen only when the user clicked
// Subjects -> "Sync from timetable", so every newly imported week arrived
// unlinked and attendance silently vanished until they clicked it again.
// autoLinkSessions now runs whenever Home or Subjects loads instead.
//
// Labels aren't consistent week to week, especially from the Gemini-based
// email import: "CBD( JS)" vs "CBD (JS)", "PM( HM) @ Classroom 101", a
// bare "ML" for "ML (SP)". resolveSubjectId tolerates those, but only
// when the match is unambiguous — this college runs parallel sections of
// the same course (DM (AH) / DM (VL)), and attendance recorded against
// the wrong section is worse than none.

/** Compare without whitespace, case-insensitively. */
export function subjectKey(label: string): string {
  return label.replace(/\s+/g, "").toLowerCase();
}

/** "Prof. Shashi Prakash " / "Dr. Anuradha Goswami" -> "shashiprakash". */
function facultyKey(name: string): string {
  return name.toLowerCase().replace(/\b(prof|dr|mr|ms|mrs)\b\.?/g, "").replace(/[^a-z]/g, "");
}

/** `aliases` comes back from raw SQL as JSON text, not an array. */
function parseAliases(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((a): a is string => typeof a === "string");
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

export interface SubjectIndex {
  /** subjectKey(name or any alias) -> subject id */
  keys: Map<string, string>;
  /** subject id -> facultyKey of everyone already seen teaching it */
  faculty: Map<string, Set<string>>;
}

export async function loadSubjectIndex(localDb: SqliteLocalDb): Promise<SubjectIndex> {
  const subjects = await localDb.raw.select<{ id: string; name: string; aliases: unknown }[]>(
    "SELECT id, name, aliases FROM subjects WHERE deleted_at IS NULL"
  );
  const keys = new Map<string, string>();
  for (const s of subjects) {
    keys.set(subjectKey(s.name), s.id);
    for (const alias of parseAliases(s.aliases)) keys.set(subjectKey(alias), s.id);
  }

  const taught = await localDb.raw.select<{ subject_id: string; faculty: string }[]>(
    "SELECT DISTINCT subject_id, faculty FROM class_sessions WHERE subject_id IS NOT NULL AND faculty IS NOT NULL AND deleted_at IS NULL"
  );
  const faculty = new Map<string, Set<string>>();
  for (const t of taught) {
    const set = faculty.get(t.subject_id) ?? new Set<string>();
    set.add(facultyKey(t.faculty));
    faculty.set(t.subject_id, set);
  }
  return { keys, faculty };
}

function only(ids: Iterable<string>): string | null {
  const distinct = new Set(ids);
  return distinct.size === 1 ? [...distinct][0]! : null;
}

export function resolveSubjectId(label: string, faculty: string | null, index: SubjectIndex): string | null {
  const key = subjectKey(label);
  if (!key) return null;

  // 1. Exact (spacing/case-insensitive) name or alias.
  const exact = index.keys.get(key);
  if (exact) return exact;

  const entries = [...index.keys];

  // 2. Label carries extra text after a subject name ("PM( HM) @ Classroom 101").
  const withSuffix = only(entries.filter(([k]) => key.startsWith(k)).map(([, id]) => id));
  if (withSuffix) return withSuffix;

  // 3. Label is an abbreviation ("ML" for "ML (SP)") — only when a single
  //    subject fits AND the faculty agrees with who teaches that subject,
  //    so "DM" can never be guessed onto the wrong DM section.
  if (key.length < 2 || !faculty) return null;
  const fKey = facultyKey(faculty);
  if (!fKey) return null;
  return only(
    entries
      .filter(([k, id]) => k.startsWith(key) && index.faculty.get(id)?.has(fKey))
      .map(([, id]) => id)
  );
}

// Same window Subjects' discovery uses: the running semester plus anything
// upcoming, without reaching back into a previous semester's history.
const LINK_WINDOW_MS = 150 * 24 * 60 * 60 * 1000;
const CHUNK = 400; // stays well under SQLite's bound-parameter limit

/** Sets subject_id on unlinked sessions that resolve to a subject. One bulk
 * UPDATE per subject (marking rows dirty so sync pushes them) rather than
 * a put() per row, which was slow enough on a full semester of sessions to
 * look frozen elsewhere in this app. Returns rows linked. */
export async function autoLinkSessions(
  localDb: SqliteLocalDb,
  index?: SubjectIndex,
  since: string = new Date(Date.now() - LINK_WINDOW_MS).toISOString()
): Promise<number> {
  const idx = index ?? (await loadSubjectIndex(localDb));
  if (idx.keys.size === 0) return 0;

  const unlinked = await localDb.raw.select<{ id: string; subject_label: string; faculty: string | null }[]>(
    "SELECT id, subject_label, faculty FROM class_sessions WHERE deleted_at IS NULL AND subject_id IS NULL AND starts_at >= $1",
    [since]
  );
  const idsBySubject = new Map<string, string[]>();
  for (const session of unlinked) {
    const subjectId = resolveSubjectId(session.subject_label, session.faculty, idx);
    if (!subjectId) continue;
    const ids = idsBySubject.get(subjectId) ?? [];
    ids.push(session.id);
    idsBySubject.set(subjectId, ids);
  }

  const now = new Date().toISOString();
  let linked = 0;
  for (const [subjectId, ids] of idsBySubject) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const placeholders = chunk.map((_, j) => `$${j + 3}`).join(", ");
      await localDb.raw.execute(
        `UPDATE class_sessions SET subject_id = $1, updated_at = $2, dirty = 1 WHERE id IN (${placeholders}) AND subject_id IS NULL`,
        [subjectId, now, ...chunk]
      );
      linked += chunk.length;
    }
  }
  return linked;
}
