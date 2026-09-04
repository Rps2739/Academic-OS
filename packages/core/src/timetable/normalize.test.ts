import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseTimetableWorkbook, normalizeTimetableGrid } from "./normalize";
import type { RawGrid } from "../schema/timetable";

// Real timetable fixtures live in samples/ at the repo root, gitignored
// (real faculty names and room numbers) — these tests read them directly
// off disk rather than from a committed fixture, and skip gracefully if
// they're not present (a fresh clone, CI, anyone other than the one
// person these files belong to).
const SAMPLES_DIR = path.resolve(process.cwd(), "../../samples");
const ORIGINAL = path.join(
  SAMPLES_DIR,
  "Timetable 11). 31st August  to 5th September  2026 MBA(BA) Sem-3 -  (Batch 2025-27).xlsx"
);
const REVISED = path.join(
  SAMPLES_DIR,
  "Revised - Timetable 11). 31st August  to 5th September  2026 MBA(BA) Sem-3 -  (Batch 2025-27) (1).xlsx"
);
const haveFixtures = existsSync(ORIGINAL) && existsSync(REVISED);

describe.skipIf(!haveFixtures)("parseTimetableWorkbook (real fixtures)", () => {
  function load(filePath: string) {
    const buf = readFileSync(filePath);
    return parseTimetableWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }

  it("extracts the correct week start", () => {
    const result = load(ORIGINAL);
    expect(result.weekStart).toBe("2026-08-31");
  });

  it("parses normal single-slot sessions with correct times and faculty", () => {
    const result = load(ORIGINAL);
    const tm20 = result.sessions.find((s) => s.subjectLabel === "TM (AG)" && s.sessionType === "Session 20");
    expect(tm20).toBeDefined();
    expect(tm20?.faculty).toBe("Dr. Anuradha Goswami");
    // Tuesday (day index 1), slot "11:00 -12:15PM" — the exact slot this
    // AM/PM-crossing bug would silently corrupt if it regressed.
    expect(tm20?.startsAt).toBe("2026-09-01T11:00:00.000Z");
    expect(tm20?.endsAt).toBe("2026-09-01T12:15:00.000Z");
  });

  it("parses a named non-class event with no session number or faculty", () => {
    const result = load(ORIGINAL);
    const onam = result.sessions.find((s) => s.subjectLabel === "Onam Celebration");
    expect(onam).toBeDefined();
    expect(onam?.sessionType).toBeNull();
    expect(onam?.faculty).toBeNull();
  });

  it("parses a wide multi-slot merge (Alchemy) as one session spanning the full merged time range", () => {
    const result = load(ORIGINAL);
    const alchemy = result.sessions.filter((s) => s.subjectLabel === "Alchemy");
    // Two separate wide merges exist per day (one covering slots 1-3, a
    // gap, then slot 4 alone) on Friday and Saturday — four total.
    expect(alchemy.length).toBe(4);
    const fridayFirst = alchemy.find((s) => s.startsAt.startsWith("2026-09-04"));
    expect(fridayFirst).toBeDefined();
    // Spans "9:30-10:45AM" through "12:30-1:45PM" in one merge.
    expect(fridayFirst?.startsAt).toBe("2026-09-04T09:30:00.000Z");
    expect(fridayFirst?.endsAt).toBe("2026-09-04T13:45:00.000Z");
  });

  it("has no unparsed-warning surprises on the real sheet", () => {
    const result = load(ORIGINAL);
    expect(result.warnings).toEqual([]);
  });

  it("detects the added Monday session in the revision that isn't in the original", () => {
    const original = load(ORIGINAL);
    const revised = load(REVISED);

    const key = (s: (typeof original.sessions)[number]) => `${s.startsAt}|${s.subjectLabel}`;
    const originalKeys = new Set(original.sessions.map(key));
    const added = revised.sessions.filter((s) => !originalKeys.has(key(s)));

    expect(added.map((s) => s.subjectLabel).sort()).toEqual(["CBD (JS)", "CBD (JS)"]);
    expect(added.every((s) => s.startsAt.startsWith("2026-08-31"))).toBe(true);
    expect(added.every((s) => s.faculty === "Prof Joydeep Sen")).toBe(true);
  });
});

describe("normalizeTimetableGrid (synthetic grid, no fixture files needed)", () => {
  it("parses a minimal single-day single-slot grid", () => {
    const grid: RawGrid = [];
    grid[5] = ["Timetable - test week"];
    grid[6] = ["Date", "9:30-10:45AM", ""];
    grid[7] = ["", "Course", "Session #"];
    grid[8] = ["", "TM (AG) - 1", ""];
    grid[41] = ["Course Name", "", "Short Name", "Faculty Name"];
    grid[42] = ["Text Mining", "", "TM (AG)", "Dr. Test"];

    const merges = [
      { s: { r: 6, c: 1 }, e: { r: 6, c: 2 } },
      { s: { r: 8, c: 1 }, e: { r: 10, c: 2 } },
    ];

    const result = normalizeTimetableGrid(grid, merges, new Date(Date.UTC(2026, 0, 5))); // a Monday
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      subjectLabel: "TM (AG)",
      sessionType: "Session 1",
      faculty: "Dr. Test",
    });
  });

  it("warns instead of throwing on an unresolvable time label", () => {
    const grid: RawGrid = [];
    grid[6] = ["Date", "not a time", ""];
    grid[8] = ["", "X (Y) - 1", ""];
    const merges = [{ s: { r: 8, c: 1 }, e: { r: 8, c: 2 } }];

    const result = normalizeTimetableGrid(grid, merges, new Date(Date.UTC(2026, 0, 5)));
    expect(result.sessions).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
