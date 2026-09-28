// Run from packages/core:  npx vitest run --root ../../supabase/functions/_shared --globals
// (--globals because vitest isn't resolvable from this folder; describe/it/expect are injected.)
import {
  mapScanPicks,
  selectCandidates,
  validateNote,
  MAX_CANDIDATES,
  MAX_PICKS_PER_SCAN,
  type Candidate,
} from "./gd-prep-core.ts";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

function cand(id: string, over: Partial<Candidate & { sourceCount: number }> = {}) {
  return {
    id,
    title: `Title ${id}`,
    link: `https://example.com/${id}`,
    source: "Test",
    summary: "Summary",
    publishedAt: hoursAgo(1),
    sourceCount: 1,
    ...over,
  };
}

const goodNote = {
  theme: "Economy",
  why: "It matters.",
  pointsFor: ["a"],
  pointsAgainst: ["b"],
  keyFacts: ["6.5% growth"],
  question: "Is growth sustainable?",
};

describe("validateNote", () => {
  it("accepts a complete note", () => {
    expect(validateNote(goodNote)).toEqual(goodNote);
  });
  it("rejects an unknown theme", () => {
    expect(validateNote({ ...goodNote, theme: "Sports" })).toBeNull();
  });
  it("rejects missing why/question or empty sides", () => {
    expect(validateNote({ ...goodNote, why: "  " })).toBeNull();
    expect(validateNote({ ...goodNote, question: undefined })).toBeNull();
    expect(validateNote({ ...goodNote, pointsFor: [] })).toBeNull();
    expect(validateNote({ ...goodNote, pointsAgainst: "nope" })).toBeNull();
  });
  it("caps lengths and list sizes, drops non-strings", () => {
    const n = validateNote({
      ...goodNote,
      why: "x".repeat(5000),
      pointsFor: ["1", "2", "3", "4", "5", "6", 7],
      keyFacts: [null, "f"],
    })!;
    expect(n.why.length).toBe(600);
    expect(n.pointsFor).toEqual(["1", "2", "3", "4"]);
    expect(n.keyFacts).toEqual(["f"]);
  });
  it("allows empty keyFacts", () => {
    expect(validateNote({ ...goodNote, keyFacts: [] })?.keyFacts).toEqual([]);
  });
});

describe("mapScanPicks", () => {
  const cands = [cand("a"), cand("b"), cand("c"), cand("d")];
  it("maps indices back to our own candidates", () => {
    const out = mapScanPicks({ picks: [{ index: 2, ...goodNote }] }, cands);
    expect(out).toHaveLength(1);
    expect(out[0]!.item.link).toBe("https://example.com/c");
  });
  it("ignores any link or title the model tries to supply", () => {
    const out = mapScanPicks(
      { picks: [{ index: 0, link: "javascript:alert(1)", title: "evil", ...goodNote }] },
      cands
    );
    expect(out[0]!.item.link).toBe("https://example.com/a");
    expect(out[0]!.item.title).toBe("Title a");
  });
  it("drops out-of-range, non-integer and duplicate indices", () => {
    const out = mapScanPicks(
      { picks: [{ index: 9, ...goodNote }, { index: 1.5, ...goodNote }, { index: 1, ...goodNote }, { index: 1, ...goodNote }] },
      cands
    );
    expect(out.map((p) => p.item.id)).toEqual(["b"]);
  });
  it("drops picks with an invalid note", () => {
    expect(mapScanPicks({ picks: [{ index: 0, ...goodNote, theme: "Sports" }] }, cands)).toEqual([]);
  });
  it(`keeps at most ${MAX_PICKS_PER_SCAN}`, () => {
    const picks = [0, 1, 2, 3].map((index) => ({ index, ...goodNote }));
    expect(mapScanPicks({ picks }, cands)).toHaveLength(MAX_PICKS_PER_SCAN);
  });
  it("returns [] for malformed output", () => {
    expect(mapScanPicks(null, cands)).toEqual([]);
    expect(mapScanPicks({ picks: "x" }, cands)).toEqual([]);
  });
});

describe("selectCandidates", () => {
  it("skips seen ids and anything older than 36 hours", () => {
    const items = [cand("new"), cand("seen"), cand("old", { publishedAt: hoursAgo(40) })];
    expect(selectCandidates(items, new Set(["seen"]), NOW).map((c) => c.id)).toEqual(["new"]);
  });
  it("dedupes the same story across categories by id and by normalised title", () => {
    const items = [cand("x"), cand("x"), cand("y", { title: "Title X!" })];
    expect(selectCandidates(items, new Set(), NOW).map((c) => c.id)).toEqual(["x"]);
  });
  it("ranks by corroboration, then recency, and caps the list", () => {
    const items = [
      cand("recent", { publishedAt: hoursAgo(1) }),
      cand("older", { publishedAt: hoursAgo(5) }),
      cand("big", { sourceCount: 4, publishedAt: hoursAgo(10) }),
    ];
    expect(selectCandidates(items, new Set(), NOW).map((c) => c.id)).toEqual(["big", "recent", "older"]);
    const many = Array.from({ length: 200 }, (_, i) => cand(`n${i}`));
    expect(selectCandidates(many, new Set(), NOW)).toHaveLength(MAX_CANDIDATES);
  });
});
