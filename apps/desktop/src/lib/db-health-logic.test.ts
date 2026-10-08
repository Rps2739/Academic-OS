// Run from packages/core:  npx vitest run --root ../../apps/desktop/src/lib --globals
import { isBackupDue, isCorruptionError, localDay, quickCheckOk, repairStamp } from "./db-health-logic.ts";

describe("isCorruptionError", () => {
  it("recognises SQLite corruption messages", () => {
    expect(isCorruptionError("error returned from database: (code: 11) database disk image is malformed")).toBe(true);
    expect(isCorruptionError(new Error("file is not a database"))).toBe(true);
    expect(isCorruptionError({ message: "(code: 26) file is not a database" })).toBe(true);
  });
  it("ignores ordinary errors", () => {
    expect(isCorruptionError("no such table: foo")).toBe(false);
    expect(isCorruptionError(new Error("database is locked"))).toBe(false);
    expect(isCorruptionError(undefined)).toBe(false);
  });
});

describe("quickCheckOk", () => {
  it("accepts exactly one ok row", () => {
    expect(quickCheckOk([{ quick_check: "ok" }])).toBe(true);
  });
  it("rejects problem reports and junk", () => {
    expect(quickCheckOk([{ quick_check: "*** in database main ***\nPage 5: btreeInitPage() returns error code 11" }])).toBe(false);
    expect(quickCheckOk([{ quick_check: "ok" }, { quick_check: "row 3 missing from index" }])).toBe(false);
    expect(quickCheckOk([])).toBe(false);
    expect(quickCheckOk(null)).toBe(false);
  });
});

describe("dates", () => {
  const d = new Date(2026, 8, 5, 7, 3); // 5 Sep 2026 07:03 local
  it("formats a local day and a repair stamp", () => {
    expect(localDay(d)).toBe("2026-09-05");
    expect(repairStamp(d)).toBe("2026-09-05-0703");
  });
  it("is due only when the day changed", () => {
    expect(isBackupDue(null, "2026-09-05")).toBe(true);
    expect(isBackupDue("2026-09-04", "2026-09-05")).toBe(true);
    expect(isBackupDue("2026-09-05", "2026-09-05")).toBe(false);
  });
});
