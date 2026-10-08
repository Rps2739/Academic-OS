// Pure decisions for the local-database health check and daily backup.
// No imports, so it's unit-testable (db-health-logic.test.ts).

const CORRUPTION = /malformed|not a database|file is encrypted|\(code: (11|26)\)/i;

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "";
}

/** SQLITE_CORRUPT (11) / SQLITE_NOTADB (26) and their usual messages. */
export function isCorruptionError(err: unknown): boolean {
  return CORRUPTION.test(messageOf(err));
}

/** PRAGMA quick_check returns exactly [{quick_check:"ok"}] when healthy. */
export function quickCheckOk(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length !== 1) return false;
  const row = rows[0] as Record<string, unknown> | null;
  return !!row && Object.values(row)[0] === "ok";
}

const pad = (n: number) => String(n).padStart(2, "0");

export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function repairStamp(d: Date): string {
  return `${localDay(d)}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function isBackupDue(lastDay: string | null, today: string): boolean {
  return lastDay !== today;
}
