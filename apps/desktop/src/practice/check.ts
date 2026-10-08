// Compares a learner's SQL result with the reference result. Pure; no
// imports (unit-tested in check.test.ts). Deliberately forgiving about
// column NAMES (aliases like count(*) vs total are fine) but strict about
// column count, values and — only when the exercise asks — row order.

export interface TableData {
  columns: string[];
  rows: unknown[][];
  total: number;
}

export type CheckOutcome = { ok: true } | { ok: false; message: string };

function cell(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(Math.round(v * 1e6) / 1e6);
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}

const rowKey = (row: unknown[]) => row.map(cell).join(" | ");
const show = (row: unknown[]) => `(${row.map(cell).join(", ")})`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function compareResults(user: TableData, expected: TableData, ordered: boolean): CheckOutcome {
  if (user.columns.length !== expected.columns.length) {
    return {
      ok: false,
      message: `Expected ${plural(expected.columns.length, "column")}, your query returned ${plural(user.columns.length, "column")}.`,
    };
  }
  if (ordered) {
    const n = Math.max(user.rows.length, expected.rows.length);
    for (let i = 0; i < n; i++) {
      const u = user.rows[i];
      const e = expected.rows[i];
      if (!u || !e || rowKey(u) !== rowKey(e)) {
        if (user.rows.length !== expected.rows.length) {
          return { ok: false, message: `Expected ${plural(expected.rows.length, "row")}, your query returned ${plural(user.rows.length, "row")}.` };
        }
        return { ok: false, message: `Row ${i + 1} differs (order matters here): expected ${show(e!)}, got ${show(u!)}.` };
      }
    }
    return { ok: true };
  }
  const counts = new Map<string, number>();
  for (const r of expected.rows) counts.set(rowKey(r), (counts.get(rowKey(r)) ?? 0) + 1);
  const extra: unknown[][] = [];
  for (const r of user.rows) {
    const k = rowKey(r);
    const c = counts.get(k) ?? 0;
    if (c > 0) counts.set(k, c - 1);
    else extra.push(r);
  }
  const missing = expected.rows.filter((r) => {
    const k = rowKey(r);
    const c = counts.get(k) ?? 0;
    if (c > 0) {
      counts.set(k, c - 1);
      return true;
    }
    return false;
  });
  if (missing.length === 0 && extra.length === 0) return { ok: true };
  const parts = [`Expected ${plural(expected.rows.length, "row")}, your query returned ${plural(user.rows.length, "row")}.`];
  if (missing.length) parts.push(`Missing, e.g. ${show(missing[0]!)}.`);
  if (extra.length) parts.push(`Unexpected, e.g. ${show(extra[0]!)}.`);
  return { ok: false, message: parts.join(" ") };
}
