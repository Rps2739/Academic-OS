import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { nextDueAt, type AttemptSummary } from "./schedule";

export async function latestAttempts(db: SqliteLocalDb): Promise<Map<string, AttemptSummary>> {
  const rows = await db.raw.select<{ question_id: string; score: number; next_due_at: string }[]>(
    "SELECT question_id, score, next_due_at FROM interview_attempts_local ORDER BY attempted_at DESC"
  );
  const map = new Map<string, AttemptSummary>();
  for (const r of rows) {
    const existing = map.get(r.question_id);
    if (!existing) map.set(r.question_id, { questionId: r.question_id, score: r.score, prevScore: null, nextDueAt: r.next_due_at });
    else if (existing.prevScore === null) existing.prevScore = r.score;
  }
  return map;
}

export async function saveAttempt(
  db: SqliteLocalDb,
  a: { questionId: string; section: string; answer: string; checked: string[]; score: number; prevScore: number | null }
): Promise<void> {
  const now = new Date();
  await db.raw.execute(
    `INSERT INTO interview_attempts_local (id, question_id, section, answer, checked_points, score, attempted_at, next_due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [crypto.randomUUID(), a.questionId, a.section, a.answer, JSON.stringify(a.checked), a.score, now.toISOString(), nextDueAt(a.score, a.prevScore, now)]
  );
}

export async function getCv(db: SqliteLocalDb): Promise<string> {
  const rows = await db.raw.select<{ text: string }[]>("SELECT text FROM interview_cv_local WHERE id = 'cv'");
  return rows[0]?.text ?? "";
}

export async function setCv(db: SqliteLocalDb, text: string): Promise<void> {
  await db.raw.execute(
    `INSERT INTO interview_cv_local (id, text, updated_at) VALUES ('cv', $1, $2)
     ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    [text, new Date().toISOString()]
  );
}
