// Run from packages/core:  npx vitest run --root ../../apps/desktop/src/practice --globals
import { compareResults, type TableData } from "./check.ts";

const t = (columns: string[], rows: unknown[][]): TableData => ({ columns, rows, total: rows.length });

describe("compareResults", () => {
  it("passes identical results", () => {
    expect(compareResults(t(["a"], [[1], [2]]), t(["a"], [[1], [2]]), false)).toEqual({ ok: true });
  });
  it("ignores row order unless ordered", () => {
    expect(compareResults(t(["a"], [[2], [1]]), t(["a"], [[1], [2]]), false)).toEqual({ ok: true });
    const r = compareResults(t(["a"], [[2], [1]]), t(["a"], [[1], [2]]), true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Row 1/);
  });
  it("ignores column names (aliases differ) but not column count", () => {
    expect(compareResults(t(["total"], [[5]]), t(["count(*)"], [[5]]), false)).toEqual({ ok: true });
    const r = compareResults(t(["a", "b"], [[1, 2]]), t(["a"], [[1]]), false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/1 column/);
  });
  it("tolerates float noise and 1 vs 1.0", () => {
    expect(compareResults(t(["x"], [[0.1 + 0.2], [3]]), t(["x"], [[0.3], [3.0]]), false)).toEqual({ ok: true });
  });
  it("treats NULL as a value", () => {
    expect(compareResults(t(["x"], [[null]]), t(["x"], [[null]]), false)).toEqual({ ok: true });
    expect(compareResults(t(["x"], [[null]]), t(["x"], [[""]]), false).ok).toBe(false);
  });
  it("reports row count and a missing/extra example", () => {
    const r = compareResults(t(["a"], [[1], [9]]), t(["a"], [[1], [2], [3]]), false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/3 rows/);
      expect(r.message).toMatch(/2 rows/);
    }
    const r2 = compareResults(t(["a"], [[1], [9]]), t(["a"], [[1], [2]]), false);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.message).toMatch(/Missing.*2/);
      expect(r2.message).toMatch(/Unexpected.*9/);
    }
  });
});
