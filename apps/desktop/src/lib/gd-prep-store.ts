import type { SqliteLocalDb } from "./sqlite-local-db";

// All SQL for the GD Prep tab's two local-only tables (lib.rs migration 9).
// Never synced — the user chose "this laptop only".

/** Keep in sync with THEMES in supabase/functions/_shared/gd-prep-core.ts. */
export const GD_THEMES = ["Economy", "Geopolitics", "Business", "Tech & AI", "India & Policy", "Environment"] as const;

export interface PrepNote {
  theme: string;
  why: string;
  pointsFor: string[];
  pointsAgainst: string[];
  keyFacts: string[];
  question: string;
}

export interface GdArticle {
  title: string;
  link: string;
  source: string | null;
  summary: string | null;
  published_at: string | null;
}

export interface GdPrepEntry extends GdArticle {
  id: string;
  added_at: string;
  manual: boolean;
  note: PrepNote | null;
}

const SEEN_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_PICKS_MS = 7 * 24 * 60 * 60 * 1000;
const SEEN_CHUNK = 300; // 2 params per row — well under SQLite's bound-parameter limit

/** Feed/model data is untrusted — only http(s) links are ever opened. */
export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function parseList(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rowToEntry(r: Record<string, unknown>): GdPrepEntry {
  const why = (r["why"] as string | null) ?? null;
  return {
    id: r["id"] as string,
    added_at: r["added_at"] as string,
    title: r["title"] as string,
    link: r["link"] as string,
    source: (r["source"] as string | null) ?? null,
    summary: (r["summary"] as string | null) ?? null,
    published_at: (r["published_at"] as string | null) ?? null,
    manual: r["manual"] === 1,
    note: why
      ? {
          theme: (r["theme"] as string | null) ?? "",
          why,
          pointsFor: parseList(r["points_for"]),
          pointsAgainst: parseList(r["points_against"]),
          keyFacts: parseList(r["key_facts"]),
          question: (r["question"] as string | null) ?? "",
        }
      : null,
  };
}

export async function listEntries(db: SqliteLocalDb): Promise<GdPrepEntry[]> {
  const rows = await db.raw.select<Record<string, unknown>[]>(
    "SELECT * FROM gd_prep_local WHERE deleted_at IS NULL ORDER BY added_at DESC"
  );
  return rows.map(rowToEntry);
}

/** Stores a scheduled-scan pick. False if that link is already stored —
 * including one the user deleted, which stays deleted. */
export async function insertPick(db: SqliteLocalDb, article: GdArticle, note: PrepNote): Promise<boolean> {
  const res = await db.raw.execute(
    `INSERT INTO gd_prep_local (id, added_at, title, link, source, summary, published_at,
       theme, why, points_for, points_against, key_facts, question, manual)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0)
     ON CONFLICT(link) DO NOTHING`,
    [
      crypto.randomUUID(),
      new Date().toISOString(),
      article.title,
      article.link,
      article.source,
      article.summary,
      article.published_at,
      note.theme,
      note.why,
      JSON.stringify(note.pointsFor),
      JSON.stringify(note.pointsAgainst),
      JSON.stringify(note.keyFacts),
      note.question,
    ]
  );
  return res.rowsAffected > 0;
}

/** Adds a story by hand. If that link is already stored it's reused —
 * brought back (to the top) if it had been deleted. */
export async function addManual(db: SqliteLocalDb, article: GdArticle): Promise<GdPrepEntry> {
  await db.raw.execute(
    `INSERT INTO gd_prep_local (id, added_at, title, link, source, summary, published_at, manual)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
     ON CONFLICT(link) DO UPDATE SET
       added_at = CASE WHEN deleted_at IS NOT NULL THEN excluded.added_at ELSE added_at END,
       deleted_at = NULL`,
    [
      crypto.randomUUID(),
      new Date().toISOString(),
      article.title,
      article.link,
      article.source,
      article.summary,
      article.published_at,
    ]
  );
  const rows = await db.raw.select<Record<string, unknown>[]>("SELECT * FROM gd_prep_local WHERE link = $1", [
    article.link,
  ]);
  return rowToEntry(rows[0]!);
}

export async function setNote(db: SqliteLocalDb, id: string, note: PrepNote): Promise<void> {
  await db.raw.execute(
    `UPDATE gd_prep_local SET theme = $2, why = $3, points_for = $4, points_against = $5, key_facts = $6, question = $7
     WHERE id = $1`,
    [
      id,
      note.theme,
      note.why,
      JSON.stringify(note.pointsFor),
      JSON.stringify(note.pointsAgainst),
      JSON.stringify(note.keyFacts),
      note.question,
    ]
  );
}

export async function setDeleted(db: SqliteLocalDb, id: string, deleted: boolean): Promise<void> {
  await db.raw.execute("UPDATE gd_prep_local SET deleted_at = $2 WHERE id = $1", [
    id,
    deleted ? new Date().toISOString() : null,
  ]);
}

/** Also prunes entries older than 7 days (older headlines are filtered by
 * age server-side anyway). */
export async function loadSeenIds(db: SqliteLocalDb): Promise<string[]> {
  await db.raw.execute("DELETE FROM gd_seen_local WHERE seen_at < $1", [
    new Date(Date.now() - SEEN_KEEP_MS).toISOString(),
  ]);
  const rows = await db.raw.select<{ id: string }[]>("SELECT id FROM gd_seen_local");
  return rows.map((r) => r.id);
}

export async function markSeen(db: SqliteLocalDb, ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += SEEN_CHUNK) {
    const chunk = ids.slice(i, i + SEEN_CHUNK);
    const values = chunk.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(", ");
    await db.raw.execute(
      `INSERT OR IGNORE INTO gd_seen_local (id, seen_at) VALUES ${values}`,
      chunk.flatMap((id) => [id, now])
    );
  }
}

/** Titles picked in the last 7 days, deleted ones included — a story the
 * user removed shouldn't be re-picked either. */
export async function recentPickTitles(db: SqliteLocalDb): Promise<string[]> {
  const rows = await db.raw.select<{ title: string }[]>(
    "SELECT title FROM gd_prep_local WHERE added_at >= $1 ORDER BY added_at DESC LIMIT 60",
    [new Date(Date.now() - RECENT_PICKS_MS).toISOString()]
  );
  return rows.map((r) => r.title);
}
