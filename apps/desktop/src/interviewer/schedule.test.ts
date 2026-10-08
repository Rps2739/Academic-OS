// Run from packages/core:  npx vitest run --root ../../apps/desktop/src/interviewer --globals
import { buildQueue, codeScore, intervalDays, nextDueAt, sectionCounts, suggestScore, type AttemptSummary } from "./schedule.ts";

const NOW = new Date("2026-10-01T10:00:00Z");
const a = (questionId: string, score: number, nextDueAt: string, prevScore: number | null = null): AttemptSummary => ({ questionId, score, prevScore, nextDueAt });

describe("intervals", () => {
  it("maps scores to days", () => {
    expect([1, 2, 3, 4, 5].map((s) => intervalDays(s, null))).toEqual([1, 2, 4, 7, 21]);
  });
  it("marks two fives in a row as mastered", () => {
    expect(intervalDays(5, 5)).toBe(45);
    expect(intervalDays(5, 4)).toBe(21);
  });
  it("computes the next due date", () => {
    expect(nextDueAt(3, null, NOW)).toBe("2026-10-05T10:00:00.000Z");
  });
});

describe("queue", () => {
  const ids = ["q1", "q2", "q3", "q4", "q5"];
  const latest = new Map([
    ["q2", a("q2", 3, "2026-09-30T00:00:00.000Z")], // due (older)
    ["q4", a("q4", 4, "2026-10-01T09:00:00.000Z")], // due (newer)
    ["q3", a("q3", 1, "2026-10-02T00:00:00.000Z")], // weak, not due
    ["q5", a("q5", 5, "2026-11-01T00:00:00.000Z")], // fine, not due → excluded
  ]);
  it("orders due, then new, then weak", () => {
    expect(buildQueue(ids, latest, NOW)).toEqual(["q2", "q4", "q1", "q3"]);
  });
  it("counts per section", () => {
    expect(sectionCounts(ids, latest, NOW)).toEqual({ due: 2, fresh: 1, weak: 1, total: 5 });
  });
});

describe("scores", () => {
  it("suggests a score from ticked key points", () => {
    expect([suggestScore(0, 5), suggestScore(1, 5), suggestScore(2, 5), suggestScore(4, 5), suggestScore(5, 5)]).toEqual([1, 2, 3, 4, 5]);
    expect(suggestScore(0, 0)).toBe(3);
  });
  it("scores code answers", () => {
    expect(codeScore(true, false)).toBe(5);
    expect(codeScore(false, false)).toBe(3);
    expect(codeScore(true, true)).toBe(1);
  });
});
