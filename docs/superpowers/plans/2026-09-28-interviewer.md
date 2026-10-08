# Interviewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, **inline in this session (no subagents)**. Steps use checkbox (`- [ ]`) syntax — tick each one in this file as you finish it.

**Goal:** A new **Interviewer** nav section for placement interview practice across eight sections:
- Case interviews
- Guesstimates
- Power BI
- Data visualisation
- SQL
- Python
- CV
- HR / standard questions

It's self-graded with checklists and model answers. SQL and Python are auto-checked, and data-viz "build it" tasks render the user's chart beside a reference. Spaced resurfacing brings back weak questions.

**Architecture:**
- **Pure logic, unit-tested:** scheduling (`interviewer/schedule.ts`) and CV-line extraction (`interviewer/cv.ts`).
- **Content:** original, as typed TS data in `interviewer/content/`.
- **Storage:** attempts and the CV go in local-only SQLite tables.
- **Reuse:** the Practice lab engine (`practice/engine/client.ts`), `practice/check.ts`, the Bharat Retail datasets, and the practice UI pieces (`CodeEditor`, `ResultView`/`DataTable`).
- **No AI, no network.**

**Tech Stack:** React 19, TypeScript, tauri-plugin-sql, the Practice lab's Pyodide engine, vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-interviewer-design.md`.

**Prerequisite:** the **Practice lab plan must be built first.** This plan imports its engine, checker, components and datasets.

**Change from the spec:** data-viz reference images are rendered from `referenceCode` by the engine on first view (cached for the session), not generated at build time. It's the same outcome with no extra build step.

## Global Constraints

- **Read `CLAUDE.md` first.** Its Operational constraints are binding.
- **Free, offline, no new online services, no AI calls, no new npm or cargo dependencies, no CSP changes.**
- **All question text, checklists, model answers and cases must be original writing.** Never copy from prep sites, books or course material. Use Indian business contexts where natural.
- **Render everything as plain React text, tables and images.** Never use `dangerouslySetInnerHTML`.
- **Local-only storage**, not in `SYNC_TABLES` (it's covered by the Reliability plan's daily backup).
- **Scoring (exact):**
  - Self-graded: the user picks 1–5. The suggested score comes from the ticked-checklist fraction: 0 → 1, <40% → 2, <60% → 3, <85% → 4, otherwise 5.
  - Code: correct on the first check → 5; correct after a failed check → 3; solution revealed → 1.
  - Case: the average of stage scores, rounded.
- **Intervals (exact):** score 1 → 1 day, 2 → 2, 3 → 4, 4 → 7, 5 → 21. A score of 5 twice in a row counts as "mastered" → 45 days.
- **Queue order (exact):** due questions (oldest due first), then never-attempted (content order), then weak (latest score ≤ 2) that aren't due yet. Other questions are excluded until due.
- **Never kill the app.** Ask the user to quit from the tray.
- **Build:** only `tauri build --no-bundle`.
- **Never write to the live SQLite file directly.**
- **Don't commit** unless asked.
- **No full-desktop screenshots.**
- **Plain-language updates.**

## File map

| File | Status | Responsibility |
|---|---|---|
| `apps/desktop/src/interviewer/schedule.ts` (+ test) | create | intervals, due, queue, counts, score helpers |
| `apps/desktop/src/interviewer/cv.ts` (+ test) | create | CV text → prompt lines with stable ids |
| `apps/desktop/src/interviewer/content/types.ts` | create | question types |
| `apps/desktop/src/interviewer/content/*.ts` | create | eight sections of original content |
| `apps/desktop/src/interviewer/content/index.ts` | create | section registry |
| `apps/desktop/src/interviewer/store.ts` | create | attempts + CV persistence |
| `apps/desktop/src-tauri/src/lib.rs` | modify | migration (next free version, expected **11**) |
| `apps/desktop/src/components/interviewer/*.tsx` | create | Timer, SelfCard, CodeCard, VizCard, CaseCard, CvEditor |
| `apps/desktop/src/components/InterviewerView.tsx` | create | sections, sessions |
| `apps/desktop/src/App.tsx`, `App.css` | modify | nav item, styles |

---

### Task 1: Scheduling and CV logic (pure) + tests

**Files:**
- Create: `apps/desktop/src/interviewer/schedule.ts`, `apps/desktop/src/interviewer/schedule.test.ts`, `apps/desktop/src/interviewer/cv.ts`, `apps/desktop/src/interviewer/cv.test.ts`

**Interfaces:**
- Produces:
  - `AttemptSummary { questionId: string; score: number; prevScore: number | null; nextDueAt: string }`
  - `intervalDays(score, prevScore): number`
  - `nextDueAt(score, prevScore, now: Date): string` (ISO)
  - `buildQueue(ids: string[], latest: Map<string, AttemptSummary>, now: Date): string[]`
  - `sectionCounts(ids, latest, now): { due: number; fresh: number; weak: number; total: number }`
  - `suggestScore(ticked: number, total: number): number`
  - `codeScore(firstTry: boolean, revealed: boolean): number`
  - `CvPrompt { id: string; line: string }`
  - `cvPrompts(text: string): CvPrompt[]`

- [x] **Step 1: Write the failing tests.** `apps/desktop/src/interviewer/schedule.test.ts`:

```ts
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
```

  `apps/desktop/src/interviewer/cv.test.ts`:

```ts
import { cvPrompts } from "./cv.ts";

describe("cvPrompts", () => {
  it("keeps substantial lines, strips bullets, drops short and duplicate lines", () => {
    const text = `RAHUL SHARMA
• Led a 4-member team to redesign the college fest sponsorship deck, raising ₹3.2L
- Led a 4-member team to redesign the college fest sponsorship deck, raising ₹3.2L
1. Built a Power BI dashboard tracking weekly sales for 12 stores
Skills: Excel, SQL`;
    const out = cvPrompts(text);
    expect(out.map((p) => p.line)).toEqual([
      "Led a 4-member team to redesign the college fest sponsorship deck, raising ₹3.2L",
      "Built a Power BI dashboard tracking weekly sales for 12 stores",
    ]);
  });
  it("gives stable ids for the same line", () => {
    expect(cvPrompts("Built a dashboard for twelve retail stores")[0]!.id).toBe(cvPrompts("  - Built a dashboard for twelve retail stores ")[0]!.id);
  });
});
```

- [x] **Step 2: Run to make sure they fail.** From `packages/core`: `npx vitest run --root ../../apps/desktop/src/interviewer --globals`. Expected: FAIL (modules missing).

- [x] **Step 3: Implement `apps/desktop/src/interviewer/schedule.ts`:**

```ts
// Spaced resurfacing for the Interviewer (spec: 1/2/4/7/21 days by score,
// 45 once mastered). Pure; no imports.

export interface AttemptSummary {
  questionId: string;
  score: number;
  prevScore: number | null;
  nextDueAt: string;
}

const DAYS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 21 };
const MASTERED_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

export function intervalDays(score: number, prevScore: number | null): number {
  if (score === 5 && prevScore === 5) return MASTERED_DAYS;
  return DAYS[Math.min(5, Math.max(1, Math.round(score)))]!;
}

export function nextDueAt(score: number, prevScore: number | null, now: Date): string {
  return new Date(now.getTime() + intervalDays(score, prevScore) * DAY_MS).toISOString();
}

const isDue = (a: AttemptSummary, now: Date) => new Date(a.nextDueAt).getTime() <= now.getTime();
const isWeak = (a: AttemptSummary) => a.score <= 2;

export function buildQueue(ids: string[], latest: Map<string, AttemptSummary>, now: Date): string[] {
  const due = ids
    .map((id) => latest.get(id))
    .filter((a): a is AttemptSummary => !!a && isDue(a, now))
    .sort((x, y) => x.nextDueAt.localeCompare(y.nextDueAt))
    .map((a) => a.questionId);
  const fresh = ids.filter((id) => !latest.has(id));
  const weak = ids.filter((id) => {
    const a = latest.get(id);
    return !!a && !isDue(a, now) && isWeak(a);
  });
  return [...due, ...fresh, ...weak];
}

export function sectionCounts(ids: string[], latest: Map<string, AttemptSummary>, now: Date) {
  let due = 0;
  let fresh = 0;
  let weak = 0;
  for (const id of ids) {
    const a = latest.get(id);
    if (!a) fresh++;
    else if (isDue(a, now)) due++;
    else if (isWeak(a)) weak++;
  }
  return { due, fresh, weak, total: ids.length };
}

export function suggestScore(ticked: number, total: number): number {
  if (total === 0) return 3;
  const f = ticked / total;
  if (ticked === 0) return 1;
  if (f < 0.4) return 2;
  if (f < 0.6) return 3;
  if (f < 0.85) return 4;
  return 5;
}

export function codeScore(firstTry: boolean, revealed: boolean): number {
  if (revealed) return 1;
  return firstTry ? 5 : 3;
}
```

- [x] **Step 4: Implement `apps/desktop/src/interviewer/cv.ts`:**

```ts
// Turns pasted CV text into "walk me through this" prompts. Pure; no imports.
// Ids are a hash of the normalised line, so progress survives re-pasting
// the same CV (edited lines simply become new questions).

export interface CvPrompt {
  id: string;
  line: string;
}

const BULLET = /^\s*(?:[-*•▪◦·–—]|\d+[.)])\s*/;
const MIN_WORDS = 5;

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function cvPrompts(text: string): CvPrompt[] {
  const seen = new Set<string>();
  const out: CvPrompt[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(BULLET, "").replace(/\s+/g, " ").trim();
    if (line.split(" ").length < MIN_WORDS) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `cv-${hash(key)}`, line });
  }
  return out;
}
```

- [x] **Step 5: Run the tests and make sure they pass.** Same command. Expected: all pass (9 tests).

---

### Task 2: Storage (migration + store)

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src/interviewer/store.ts`

- [x] **Step 1: Migration.** Append a new `Migration` after the last one in `migrations()`, the same way as the earlier plans (change the final `    }]` to `    }, Migration { … }]`). Use the **next free version number**: expected `11` if the Practice lab's `10` exists. Never edit an existing version.

```rust
    }, Migration {
        // Interviewer (docs/superpowers/specs/2026-09-28-interviewer-design.md).
        // Local-only; covered by the daily backup. One row per attempt.
        version: 11,
        description: "interviewer_local",
        kind: MigrationKind::Up,
        sql: "
            CREATE TABLE interview_attempts_local (
                id TEXT PRIMARY KEY, question_id TEXT NOT NULL, section TEXT NOT NULL,
                answer TEXT, checked_points TEXT, score INTEGER NOT NULL,
                attempted_at TEXT NOT NULL, next_due_at TEXT NOT NULL
            );
            CREATE INDEX idx_interview_attempts_q ON interview_attempts_local (question_id, attempted_at DESC);
            CREATE TABLE interview_cv_local (id TEXT PRIMARY KEY, text TEXT NOT NULL, updated_at TEXT NOT NULL);
        ",
    }]
```

- [x] **Step 2: `apps/desktop/src/interviewer/store.ts`:**

```ts
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
```

  Note: when `latestAttempts` sees a question's 2nd-newest row, `prevScore` is the score **before** the latest. When saving a new attempt, pass `prevScore = latest.get(id)?.score ?? null`, the latest *before* this one. That's what `intervalDays(5, 5)` needs.

- [x] **Step 3: Typecheck.** Run `cd apps/desktop; npx tsc --noEmit`.

---

### Task 3: Content types, registry and original content

**Files:**
- Create: `apps/desktop/src/interviewer/content/types.ts`, `index.ts`, `hr.ts`, `guesstimate.ts`, `powerbi.ts`, `dataviz.ts`, `sql.ts`, `python.ts`, `case.ts`, `cv.ts`

- [x] **Step 1: `content/types.ts`:**

```ts
export type SectionId = "case" | "guesstimate" | "powerbi" | "dataviz" | "sql" | "python" | "cv" | "hr";

export interface SelfQuestion {
  kind: "self";
  id: string;
  section: SectionId;
  prompt: string;
  keyPoints: string[];
  modelAnswer: string;
  mistakes: string[];
}

export interface CodeQuestion {
  kind: "code";
  id: string;
  section: "sql" | "python";
  prompt: string;
  starter: string;
  solution: string;
  ordered?: boolean; // SQL
  tests?: string; // Python asserts
}

export interface VizQuestion {
  kind: "viz";
  id: string;
  section: "dataviz";
  prompt: string;
  referenceCode: string; // python using load(...) + matplotlib/seaborn; rendered by the engine
  starter: string;
  checklist: string[];
}

export interface Exhibit {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface CaseStage {
  name: "Clarify" | "Structure" | "Analysis" | "Recommendation";
  ask: string;
  exhibits?: Exhibit[];
  model: string;
  checklist: string[];
}

export interface CaseQuestion {
  kind: "case";
  id: string;
  section: "case";
  title: string;
  prompt: string;
  stages: CaseStage[];
}

export type Question = SelfQuestion | CodeQuestion | VizQuestion | CaseQuestion;

export interface Section {
  id: SectionId;
  title: string;
  blurb: string;
  timerDefaultMin: number; // 0 = off
  questions: Question[];
}
```

- [x] **Step 2: Write the content, one exported array per file, with ids prefixed by section** (`hr-01`, `gs-01`, `pbi-01`, `dv-01`, `iq-sql-01`, `iq-py-01`, `case-01`, `cvg-01`).

  **Exact examples** (copy these as the first item of each file; they fix the format):

  `hr.ts`:

```ts
import type { SelfQuestion } from "./types";

export const HR: SelfQuestion[] = [
  {
    kind: "self",
    id: "hr-01",
    section: "hr",
    prompt: "Tell me about yourself.",
    keyPoints: [
      "Opens with a one-line identity (who you are now)",
      "2–3 chosen highlights, each with a concrete result",
      "Links your background to this role/company",
      "Ends with why you're here / what you're looking for",
      "Stays under about 90 seconds; no life story or CV read-out",
    ],
    modelAnswer:
      "I'm an MBA student at SIBM Bengaluru specialising in analytics, and before the MBA I spent two years as an operations analyst. Two things I'm proud of: I automated a weekly inventory report that saved my team about six hours a week, and at SIBM I led our case-competition team to the national finals with a retail pricing recommendation. What connects them is that I like turning messy data into a decision someone can act on — which is exactly what this role does, and why I'm excited to talk to you.",
    mistakes: ["Reciting the CV in order", "Going past two minutes", "No link to the role", "Only adjectives ('hard-working, passionate') with no evidence"],
  },
];
```

  `sql.ts` (**must** use the Practice datasets):

```ts
import type { CodeQuestion } from "./types";

export const SQL_Q: CodeQuestion[] = [
  {
    kind: "code",
    id: "iq-sql-01",
    section: "sql",
    prompt: "Find the second-highest salary among employees. Return a single column.",
    starter: "",
    solution: "SELECT MAX(salary) FROM employees WHERE salary < (SELECT MAX(salary) FROM employees);",
  },
];
```

  `python.ts`:

```ts
import type { CodeQuestion } from "./types";

export const PY_Q: CodeQuestion[] = [
  {
    kind: "code",
    id: "iq-py-01",
    section: "python",
    prompt: "Using load('orders'), create a DataFrame `by_status` with one row per status and a column `orders` holding the count, sorted by orders descending.",
    starter: "orders = load('orders')\nby_status = ",
    solution: "orders = load('orders')\nby_status = orders.groupby('status').size().reset_index(name='orders').sort_values('orders', ascending=False)",
    tests: `import pandas as pd
assert isinstance(by_status, pd.DataFrame), "by_status should be a DataFrame"
assert list(by_status.columns) == ["status", "orders"], f"columns should be ['status','orders'], got {list(by_status.columns)}"
assert by_status["orders"].is_monotonic_decreasing, "sort by orders, highest first"
assert int(by_status["orders"].sum()) == len(load('orders')), "counts should add up to all orders"`,
  },
];
```

  `dataviz.ts` (one judgement item and one build-it item):

```ts
import type { SelfQuestion, VizQuestion } from "./types";

export const DATAVIZ: (SelfQuestion | VizQuestion)[] = [
  {
    kind: "self",
    id: "dv-01",
    section: "dataviz",
    prompt: "A regional head wants to see how monthly revenue has moved over the last 24 months for each of 5 regions. Which chart, and why?",
    keyPoints: [
      "Line chart (time on x-axis, revenue on y)",
      "One line per region, max ~5 lines, direct labels or a clear legend",
      "Consistent y-axis starting point / no misleading truncation",
      "Highlight the region or period that matters to the head",
      "Mention an alternative (small multiples) if lines overlap",
    ],
    modelAnswer:
      "A line chart with months on the x-axis and revenue on the y-axis, one line per region. Five lines is readable; I'd label each line at its end instead of a legend and use one accent colour for the region the head cares most about, greying the rest. If the lines tangle, I'd switch to small multiples — five mini line charts sharing the same y-axis — so each region's trend is clear and still comparable.",
    mistakes: ["Pie or bar chart for a trend over time", "Separate y-axes per region that hide scale differences", "Rainbow colours with a far-away legend"],
  },
  {
    kind: "viz",
    id: "dv-02",
    section: "dataviz",
    prompt: "Recreate this chart: total delivered revenue by product category, as a horizontal bar chart sorted from highest to lowest, with a title and axis label.",
    referenceCode: `import matplotlib.pyplot as plt
ms = load("monthly_sales")
rev = ms.groupby("category")["revenue"].sum().sort_values()
fig, ax = plt.subplots(figsize=(7, 3.5))
ax.barh(rev.index, rev.values / 1e7, color="#4c72b0")
ax.set_title("Delivered revenue by category (Jul 2024 – Jun 2026)")
ax.set_xlabel("Revenue (₹ crore)")
fig.tight_layout()`,
    starter: `import matplotlib.pyplot as plt
ms = load("monthly_sales")
`,
    checklist: [
      "Horizontal bars, one per category",
      "Sorted so the biggest category is at the top",
      "Correct aggregation (sum of revenue per category)",
      "Readable units (₹ crore or lakh), labelled axis",
      "Clear title; no 3D, no rainbow colours",
    ],
  },
];
```

  `case.ts` (one complete case: four stages, and at least one exhibit in Analysis):

```ts
import type { CaseQuestion } from "./types";

export const CASES: CaseQuestion[] = [
  {
    kind: "case",
    id: "case-01",
    section: "case",
    title: "Profitability — a café chain's falling margins",
    prompt:
      "Your client runs 40 cafés across Bengaluru and Pune. Revenue grew 12% last year, but operating profit fell by a third. The founder wants to know why, and what to do in the next six months.",
    stages: [
      {
        name: "Clarify",
        ask: "What would you ask the founder before structuring the problem? List your clarifying questions.",
        model:
          "Useful clarifications: How is 'operating profit' defined (before or after head-office costs)? Did the store count change — how many new cafés opened, and when? Is the fall across all cafés or concentrated in some? Any changes in pricing, menu, delivery-app share, or rent terms? What's the goal — restore margin to last year's level, or a specific target?",
        checklist: ["Defines the metric", "Asks about store count / new openings", "Asks where the decline is concentrated", "Asks about price, mix or channel changes", "Confirms the objective and timeline"],
      },
      {
        name: "Structure",
        ask: "Lay out how you'd break the problem down.",
        model:
          "Profit = Revenue − Costs. Revenue: number of cafés × orders per café × average order value, split by channel (dine-in vs delivery apps, where commission eats margin). Costs: variable (ingredients, packaging, app commissions) and fixed (rent, staff, utilities), plus one-off costs of new openings. Compare mature cafés with new ones separately so that growth doesn't hide a margin problem.",
        checklist: ["Profit = revenue − cost", "Revenue drivers split (stores × orders × AOV)", "Channel split (delivery commission)", "Fixed vs variable costs", "Separates new from mature stores"],
      },
      {
        name: "Analysis",
        ask: "Here's the data you asked for. What does it tell you?",
        exhibits: [
          {
            title: "Last year vs this year (all cafés)",
            columns: ["Metric", "Last year", "This year"],
            rows: [
              ["Cafés open (year end)", 30, 40],
              ["Delivery share of orders", "22%", "41%"],
              ["Avg delivery commission", "24%", "26%"],
              ["Rent per café (₹ lakh / yr)", 18, 21],
            ],
          },
        ],
        model:
          "Two things drive the fall. First, delivery nearly doubled as a share of orders while commission rose to 26%, so a large slice of revenue now carries a heavy cost — revenue grows while margin shrinks. Second, ten new cafés at higher rent haven't matured yet. The growth masked a mix shift towards low-margin orders.",
        checklist: ["Spots the delivery-mix shift", "Quantifies commission impact roughly", "Notes new-store drag and higher rent", "Separates growth from profitability"],
      },
      {
        name: "Recommendation",
        ask: "Give your recommendation in under a minute.",
        model:
          "Recommend three moves: (1) price delivery menus 8–10% above dine-in and push a direct-order channel with a loyalty discount, to claw back commission; (2) pause new openings for six months and fix the ten newest cafés — renegotiate or exit the worst two on rent; (3) track contribution margin by channel monthly. Risk: delivery price rises may cut volume, so pilot in five cafés first.",
        checklist: ["Leads with the answer", "2–3 concrete actions tied to the analysis", "Mentions a risk or next step", "Gives a timeline"],
      },
    ],
  },
];
```

  `guesstimate.ts`, `powerbi.ts` and `cv.ts` (generic CV questions) use `SelfQuestion`, in the same shape as the HR example.

- [x] **Step 3: Fill in the remaining content.** The prompts below are **exact**. Write the `keyPoints` (4–6), `modelAnswer` (80–180 words, original) and `mistakes` (2–4) yourself. For code questions, write `solution` and, for Python, `tests`. Run every SQL/Python solution through the engine in Task 5 to make sure it passes.

  **HR (`hr-02`…`hr-30`):**
  - Why MBA?
  - Why this company?
  - Why this role?
  - Walk me through a failure and what you learned.
  - Your greatest strength?
  - A real weakness and what you're doing about it.
  - A time you handled conflict in a team.
  - A time you led without formal authority.
  - A time you disagreed with a senior.
  - A time you worked under a tight deadline.
  - Describe a decision you made with incomplete data.
  - A time you persuaded someone.
  - Where do you see yourself in five years?
  - Why should we hire you?
  - What do you do outside work/studies?
  - Tell me about a project you're proud of.
  - A time you made a mistake at work.
  - How do you prioritise when everything is urgent?
  - How do you handle feedback you disagree with?
  - Describe your ideal manager.
  - What motivates you?
  - What are your salary expectations?
  - Are you open to relocation?
  - Tell me about a time you went beyond your role.
  - How would your friends describe you?
  - What's a trend in our industry you're watching?
  - Why did you choose SIBM?
  - What will you do if you don't get this role?
  - Any questions for us?

  **Guesstimates (`gs-01`…`gs-15`):**
  - Daily UPI transactions in Bengaluru.
  - Annual market for school bags in India.
  - Number of two-wheelers sold in India per year.
  - Tea cups consumed in Mumbai daily.
  - Revenue of a single Bengaluru metro station's shops per month.
  - Number of petrol pumps in India.
  - Annual smartphone screen-replacement market in India.
  - Cars passing Silk Board junction on a weekday.
  - Coaching-class market for CAT aspirants.
  - Weekly Swiggy/Zomato orders in Pune.
  - Diapers sold in India per year.
  - Number of ATMs needed in a new tier-2 city.
  - Annual revenue of a multiplex screen.
  - Cricket bats sold in India per year.
  - EV charging stations needed in Delhi by 2030.

  **Power BI (`pbi-01`…`pbi-25`):**
  - *Concepts, 01–10:*
    - Star vs snowflake schema — which and why?
    - Fact vs dimension tables with a retail example.
    - One-to-many relationships and cross-filter direction — when is bi-directional risky?
    - Power Query vs DAX — what goes where?
    - Measures vs calculated columns.
    - Row-level security — how would you restrict each region head to their region?
    - Import vs DirectQuery.
    - Incremental refresh and gateways.
    - Three ways to speed up a slow report.
    - What is a date table and why mark it?
  - *DAX, 11–20:* write measures for:
    - total delivered revenue;
    - revenue YTD;
    - revenue same period last year;
    - YoY growth % with DIVIDE;
    - % of total with ALL;
    - % of category total with ALLEXCEPT;
    - rank of products by revenue with RANKX;
    - running total;
    - average order value;
    - customers with 2+ orders.
  - *Dashboard scenarios, 21–25:*
    - A sales head's weekly dashboard.
    - A CFO one-pager.
    - A store-manager daily view on a phone.
    - Diagnosing a sudden revenue drop.
    - Designing KPIs for a new loyalty programme.

  **Data visualisation:**
  - *Judgement (`dv-03`…`dv-15`):*
    - Pie vs bar for category share.
    - What's wrong with a 12-slice pie?
    - When to use a histogram vs a bar chart.
    - Showing correlation between price and quantity.
    - A truncated y-axis — misleading or acceptable?
    - Dual-axis charts — when do they mislead?
    - Choosing colours for colour-blind readers.
    - Showing a distribution across regions.
    - How to show a target vs actual.
    - Dashboard layout for a CXO (the F-pattern, top-left KPI).
    - Storytelling: turning a chart into a headline.
    - Heatmap vs table for region × month.
    - Too many KPIs — how do you cut down?
  - *Build it (`dv-16`…`dv-22`, `VizQuestion`, reference code must use `load(...)`):*
    - monthly delivered revenue line (2024–26);
    - orders by payment method, sorted bar;
    - salary distribution histogram;
    - revenue by region × category heatmap (seaborn);
    - scatter of unit_price vs quantity (order_items joined to products);
    - box plot of salary by department (seaborn);
    - stacked bar of order status by region.

  **SQL (`iq-sql-02`…`iq-sql-20`),** over the Bharat Retail tables:
  - top 3 products per category by revenue;
  - month-over-month revenue change;
  - customers who ordered in 2024 but not 2025;
  - running total of revenue by month;
  - department with the highest average salary;
  - employees earning more than their manager;
  - duplicate customer names ignoring case/spaces;
  - repeat-customer rate;
  - revenue share per region %;
  - first order date per customer;
  - average days between a customer's orders;
  - cancelled-order rate per payment method;
  - products never ordered;
  - Nth-highest price (N=5);
  - 7-day rolling order count;
  - cohort: customers by signup month and whether they ordered within 30 days;
  - pivot of order status counts per region using CASE;
  - median unit_price (SQLite, no MEDIAN function);
  - top customer per region by spend.

  Use `ordered: true` only when the prompt says "sorted".

  **Python (`iq-py-02`…`iq-py-20`):**
  - reverse words in a sentence;
  - check for a palindrome ignoring punctuation;
  - FizzBuzz returning a list;
  - count character frequencies into a dict;
  - flatten a nested list;
  - two-sum indices;
  - remove duplicates keeping order;
  - validate an Indian PIN code (6 digits, not starting with 0);
  - pandas: revenue by region;
  - pandas: top 5 customers by spend;
  - pandas: fill missing city with "Unknown" and count;
  - pandas: monthly order counts with `to_datetime`;
  - pandas: merge items+products and compute margin %;
  - pandas: pivot region × category;
  - pandas: rank employees by salary within department;
  - pandas: percentage of cancelled orders;
  - numpy: normalise an array to 0–1;
  - write `moving_average(values, k)`;
  - group anagrams;
  - clean and title-case names from customers.

  **Cases (`case-02`…`case-10`),** each with all four stages and exhibits in Analysis:
  - market entry — a D2C skincare brand entering tier-2 cities;
  - pricing — an EV scooter subscription;
  - growth — a regional bank's credit-card uptake;
  - M&A — a quick-commerce player buying a dark-store operator;
  - operations — a hospital's OPD waiting times;
  - profitability — a coaching institute;
  - market sizing plus entry — premium pet food in India;
  - new product — a UPI-based savings feature;
  - turnaround — a mid-size apparel retailer's falling footfall.

  **Generic CV (`cvg-01`…`cvg-10`):**
  - Walk me through your CV.
  - What's the biggest achievement on your CV?
  - Which line on your CV would you defend hardest?
  - Explain a gap or change in direction.
  - Which skill on your CV is weakest, honestly?
  - Tell me about your summer internship in 60 seconds.
  - What did your last role teach you?
  - Which project shows your analytical skills best?
  - What would your previous manager say about you?
  - What's not on your CV that we should know?

- [x] **Step 4: `content/index.ts`:**

```ts
import type { Question, Section, SelfQuestion } from "./types";
import { HR } from "./hr";
import { GUESSTIMATES } from "./guesstimate";
import { POWER_BI } from "./powerbi";
import { DATAVIZ } from "./dataviz";
import { SQL_Q } from "./sql";
import { PY_Q } from "./python";
import { CASES } from "./case";
import { CV_GENERIC } from "./cv";
import { cvPrompts } from "../cv";

export const SECTIONS: Section[] = [
  { id: "case", title: "Case interviews", blurb: "Staged cases: clarify, structure, analyse, recommend.", timerDefaultMin: 0, questions: CASES },
  { id: "guesstimate", title: "Guesstimates", blurb: "Market sizing with Indian contexts.", timerDefaultMin: 5, questions: GUESSTIMATES },
  { id: "powerbi", title: "Power BI", blurb: "Modelling, DAX and dashboard design.", timerDefaultMin: 0, questions: POWER_BI },
  { id: "dataviz", title: "Data visualisation", blurb: "Choosing, critiquing and building charts.", timerDefaultMin: 0, questions: DATAVIZ },
  { id: "sql", title: "SQL", blurb: "Interview SQL on the Bharat Retail tables — auto-checked.", timerDefaultMin: 10, questions: SQL_Q },
  { id: "python", title: "Python", blurb: "Coding and pandas questions — auto-checked.", timerDefaultMin: 10, questions: PY_Q },
  { id: "cv", title: "CV", blurb: "Questions about your own CV lines.", timerDefaultMin: 2, questions: CV_GENERIC },
  { id: "hr", title: "HR & standard", blurb: "Tell me about yourself, why MBA, strengths…", timerDefaultMin: 2, questions: HR },
];

const CV_CHECKLIST = [
  "Context: where, when, why it mattered",
  "What YOU did (not the team)",
  "A measurable result",
  "What you learned",
  "Why it matters for this role",
];

/** CV section = generic CV questions + one prompt per substantial line of the user's CV. */
export function cvQuestions(cvText: string): Question[] {
  const fromCv: SelfQuestion[] = cvPrompts(cvText).map((p) => ({
    kind: "self",
    id: p.id,
    section: "cv",
    prompt: `Walk me through this line from your CV: "${p.line}"`,
    keyPoints: CV_CHECKLIST,
    modelAnswer:
      "Use a short STAR shape: one sentence of Situation and Task, two or three sentences on the Actions you personally took, then the Result with a number, and close with what you learned or how it applies to this role. Aim for 60–90 seconds.",
    mistakes: ["Saying 'we' throughout", "No number or outcome", "Re-reading the line instead of explaining it"],
  }));
  return [...CV_GENERIC, ...fromCv];
}
```

- [x] **Step 5: Typecheck.** Run `cd apps/desktop; npx tsc --noEmit`.

---

### Task 4: UI

**Files:**
- Create: `apps/desktop/src/components/interviewer/Timer.tsx`, `SelfCard.tsx`, `CodeCard.tsx`, `VizCard.tsx`, `CaseCard.tsx`, `CvEditor.tsx`, `apps/desktop/src/components/InterviewerView.tsx`
- Modify: `apps/desktop/src/App.tsx`, `apps/desktop/src/App.css`

**Interfaces:**
- Each card takes `{ question; onDone: (r: { score: number; answer: string; checked: string[] }) => void }`.

- [x] **Step 1: `components/interviewer/Timer.tsx`:**

```tsx
import { useEffect, useState } from "react";

/** Countdown shown during a question. Never blocks — just says when time's up. */
export function Timer({ minutes, resetKey }: { minutes: number; resetKey: string }) {
  const [left, setLeft] = useState(minutes * 60);
  useEffect(() => setLeft(minutes * 60), [minutes, resetKey]);
  useEffect(() => {
    if (minutes === 0) return;
    const h = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(h);
  }, [minutes, resetKey]);
  if (minutes === 0) return null;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return <span className={`iv-timer ${left === 0 ? "is-up" : ""}`}>{left === 0 ? "Time's up" : `${mm}:${ss}`}</span>;
}
```

- [x] **Step 2: `components/interviewer/SelfCard.tsx`:**

```tsx
import { useMemo, useState } from "react";
import type { SelfQuestion } from "../../interviewer/content/types";
import { suggestScore } from "../../interviewer/schedule";

interface Props {
  question: SelfQuestion;
  onDone: (r: { score: number; answer: string; checked: string[] }) => void;
}

export function ScorePicker({ suggested, onPick }: { suggested: number; onPick: (s: number) => void }) {
  return (
    <div className="iv-score">
      <span>How did you do?</span>
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} className={`iv-score__btn ${s === suggested ? "is-suggested" : ""}`} onClick={() => onPick(s)} title={s === suggested ? "Suggested from your checklist" : undefined}>
          {s}
        </button>
      ))}
    </div>
  );
}

export function Checklist({ items, checked, onToggle }: { items: string[]; checked: Set<number>; onToggle: (i: number) => void }) {
  return (
    <ul className="iv-checklist">
      {items.map((k, i) => (
        <li key={i}>
          <label>
            <input type="checkbox" checked={checked.has(i)} onChange={() => onToggle(i)} /> {k}
          </label>
        </li>
      ))}
    </ul>
  );
}

export function SelfCard({ question, onDone }: Props) {
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const suggested = useMemo(() => suggestScore(checked.size, question.keyPoints.length), [checked, question]);
  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="iv-card">
      <p className="iv-prompt">{question.prompt}</p>
      <textarea className="iv-answer" rows={8} placeholder="Type your answer as you'd say it…" value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={revealed} />
      {!revealed ? (
        <button className="btn btn--primary btn--sm" onClick={() => setRevealed(true)}>
          Submit and compare
        </button>
      ) : (
        <>
          <h4>Tick what your answer covered</h4>
          <Checklist items={question.keyPoints} checked={checked} onToggle={toggle} />
          <h4>Model answer</h4>
          <p className="iv-model">{question.modelAnswer}</p>
          <h4>Common mistakes</h4>
          <ul className="iv-mistakes">
            {question.mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          <ScorePicker suggested={suggested} onPick={(score) => onDone({ score, answer, checked: [...checked].map((i) => question.keyPoints[i]!) })} />
        </>
      )}
    </div>
  );
}
```

- [x] **Step 3: `components/interviewer/CodeCard.tsx`:**

```tsx
import { useState } from "react";
import type { CodeQuestion } from "../../interviewer/content/types";
import { codeScore } from "../../interviewer/schedule";
import { engine } from "../../practice/engine/client";
import { compareResults } from "../../practice/check";
import type { RunResult } from "../../practice/engine/protocol";
import { CodeEditor } from "../practice/CodeEditor";
import { ResultView } from "../practice/ResultView";

interface Props {
  question: CodeQuestion;
  onDone: (r: { score: number; answer: string; checked: string[] }) => void;
}

export function CodeCard({ question, onDone }: Props) {
  const [code, setCode] = useState(question.starter);
  const [result, setResult] = useState<RunResult | null>(null);
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null);
  const [failedOnce, setFailedOnce] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const mode = question.section;

  async function run() {
    setBusy(true);
    try {
      setResult(await engine.run(mode, code));
    } catch (e) {
      setResult({ ok: false, stdout: "", stderr: "", error: e instanceof Error ? e.message : String(e), images: [] });
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    try {
      let ok = false;
      let message = "";
      if (mode === "sql") {
        const r = await engine.sqlCheck(code, question.solution);
        if (r.user && r.expected) {
          const o = compareResults(r.user, r.expected, question.ordered === true);
          ok = o.ok;
          message = o.ok ? "Correct!" : o.message;
        } else message = r.error ?? "Your query didn't run.";
      } else {
        const r = await engine.run("python", code, question.tests);
        setResult(r);
        ok = r.test?.passed === true;
        message = ok ? "Correct!" : r.test?.message ?? r.error ?? "Not quite.";
      }
      setVerdict({ ok, message });
      if (ok) onDone({ score: codeScore(!failedOnce, revealed), answer: code, checked: [] });
      else setFailedOnce(true);
    } catch (e) {
      setVerdict({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="iv-card">
      <p className="iv-prompt">{question.prompt}</p>
      <CodeEditor value={code} onChange={setCode} onRun={() => void run()} label="Your answer" rows={10} />
      <div className="exercise__actions">
        <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => void run()}>Run</button>
        <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => void check()}>Check</button>
        {failedOnce && !revealed && (
          <button className="btn btn--ghost btn--sm" onClick={() => setRevealed(true)}>Show solution</button>
        )}
        {revealed && (
          <button className="btn btn--ghost btn--sm" onClick={() => onDone({ score: codeScore(false, true), answer: code, checked: [] })}>
            Next question
          </button>
        )}
      </div>
      {verdict && <p className={`exercise__verdict ${verdict.ok ? "is-ok" : "is-bad"}`}>{verdict.message}</p>}
      {revealed && <pre className="exercise__solution">{question.solution}</pre>}
      {result && <ResultView result={result} />}
    </div>
  );
}
```

  Behaviour: a correct Check immediately records and moves on (score 5 or 3). After a failed Check, "Show solution" appears. Revealing records a score of 1 when the user clicks "Next question".

- [x] **Step 4: `components/interviewer/VizCard.tsx`:**

```tsx
import { useEffect, useMemo, useState } from "react";
import type { VizQuestion } from "../../interviewer/content/types";
import { suggestScore } from "../../interviewer/schedule";
import { engine } from "../../practice/engine/client";
import type { RunResult } from "../../practice/engine/protocol";
import { CodeEditor } from "../practice/CodeEditor";
import { ResultView } from "../practice/ResultView";
import { Checklist, ScorePicker } from "./SelfCard";

const referenceCache = new Map<string, string>();

interface Props {
  question: VizQuestion;
  onDone: (r: { score: number; answer: string; checked: string[] }) => void;
}

export function VizCard({ question, onDone }: Props) {
  const [reference, setReference] = useState<string | null>(referenceCache.get(question.id) ?? null);
  const [refError, setRefError] = useState("");
  const [code, setCode] = useState(question.starter);
  const [result, setResult] = useState<RunResult | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const suggested = useMemo(() => suggestScore(checked.size, question.checklist.length), [checked, question]);

  useEffect(() => {
    if (referenceCache.has(question.id)) return;
    engine.run("python", question.referenceCode).then(
      (r) => {
        const img = r.images[0];
        if (img) {
          referenceCache.set(question.id, img);
          setReference(img);
        } else setRefError(r.error ?? "The reference chart didn't render.");
      },
      (e: Error) => setRefError(e.message)
    );
  }, [question]);

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="iv-card">
      <p className="iv-prompt">{question.prompt}</p>
      <div className="iv-viz">
        <figure>
          <figcaption>Target</figcaption>
          {reference ? <img className="practice-result__chart" src={reference} alt="Reference chart" /> : <p className="practice-muted">{refError || "Rendering…"}</p>}
        </figure>
        <figure>
          <figcaption>Yours</figcaption>
          {result?.images[0] ? <img className="practice-result__chart" src={result.images[0]} alt="Your chart" /> : <p className="practice-muted">Run your code to see it here.</p>}
        </figure>
      </div>
      <CodeEditor value={code} onChange={setCode} onRun={() => void engine.run("python", code).then(setResult)} label="Your chart code" rows={10} />
      <div className="exercise__actions">
        <button className="btn btn--primary btn--sm" onClick={() => void engine.run("python", code).then(setResult)}>Run</button>
      </div>
      {result && !result.images[0] && <ResultView result={result} />}
      {result?.images[0] && (
        <>
          <h4>Compare against the checklist</h4>
          <Checklist items={question.checklist} checked={checked} onToggle={toggle} />
          <ScorePicker suggested={suggested} onPick={(score) => onDone({ score, answer: code, checked: [...checked].map((i) => question.checklist[i]!) })} />
        </>
      )}
    </div>
  );
}
```

- [x] **Step 5: `components/interviewer/CaseCard.tsx`:**

```tsx
import { useMemo, useState } from "react";
import type { CaseQuestion } from "../../interviewer/content/types";
import { suggestScore } from "../../interviewer/schedule";
import { DataTable } from "../practice/ResultView";
import { Checklist, ScorePicker } from "./SelfCard";

interface Props {
  question: CaseQuestion;
  onDone: (r: { score: number; answer: string; checked: string[] }) => void;
}

export function CaseCard({ question, onDone }: Props) {
  const [stageIndex, setStageIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => question.stages.map(() => ""));
  const [scores, setScores] = useState<number[]>([]);
  const [shownExhibits, setShownExhibits] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [allChecked, setAllChecked] = useState<string[]>([]);
  const stage = question.stages[stageIndex]!;
  const suggested = useMemo(() => suggestScore(checked.size, stage.checklist.length), [checked, stage]);

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  function finishStage(score: number) {
    const ticked = [...checked].map((i) => `${stage.name}: ${stage.checklist[i]}`);
    const nextScores = [...scores, score];
    const nextChecked = [...allChecked, ...ticked];
    if (stageIndex === question.stages.length - 1) {
      const avg = Math.round(nextScores.reduce((a, b) => a + b, 0) / nextScores.length);
      onDone({ score: avg, answer: JSON.stringify(question.stages.map((s, i) => ({ stage: s.name, answer: answers[i] }))), checked: nextChecked });
      return;
    }
    setScores(nextScores);
    setAllChecked(nextChecked);
    setStageIndex(stageIndex + 1);
    setRevealed(false);
    setShownExhibits(false);
    setChecked(new Set());
  }

  return (
    <div className="iv-card">
      <h3 className="iv-case__title">{question.title}</h3>
      <p className="iv-prompt">{question.prompt}</p>
      <ol className="iv-stages">
        {question.stages.map((s, i) => (
          <li key={s.name} className={i === stageIndex ? "is-current" : i < stageIndex ? "is-done" : undefined}>
            {s.name}
          </li>
        ))}
      </ol>
      <p className="iv-ask">{stage.ask}</p>
      {stage.exhibits && !shownExhibits && (
        <button className="btn btn--secondary btn--sm" onClick={() => setShownExhibits(true)}>
          Show the data
        </button>
      )}
      {stage.exhibits &&
        shownExhibits &&
        stage.exhibits.map((ex) => (
          <figure key={ex.title} className="iv-exhibit">
            <figcaption>{ex.title}</figcaption>
            <DataTable table={{ columns: ex.columns, rows: ex.rows, total: ex.rows.length }} />
          </figure>
        ))}
      <textarea
        className="iv-answer"
        rows={7}
        value={answers[stageIndex]}
        disabled={revealed}
        onChange={(e) => setAnswers((prev) => prev.map((a, i) => (i === stageIndex ? e.target.value : a)))}
        placeholder="Your answer for this stage…"
      />
      {!revealed ? (
        <button className="btn btn--primary btn--sm" onClick={() => setRevealed(true)}>
          Submit and compare
        </button>
      ) : (
        <>
          <h4>Tick what you covered</h4>
          <Checklist items={stage.checklist} checked={checked} onToggle={toggle} />
          <h4>Model {stage.name.toLowerCase()}</h4>
          <p className="iv-model">{stage.model}</p>
          <ScorePicker suggested={suggested} onPick={finishStage} />
        </>
      )}
    </div>
  );
}
```

- [x] **Step 6: `components/interviewer/CvEditor.tsx`:**

```tsx
import { useState } from "react";
import { cvPrompts } from "../../interviewer/cv";

/** Paste the CV once; it stays on this laptop only (interview_cv_local). */
export function CvEditor({ initial, onSave }: { initial: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  const n = cvPrompts(text).length;
  return (
    <div className="iv-card">
      <p className="iv-prompt">Paste your CV text below. It's stored only on this laptop. Each substantial line becomes a "walk me through this" question.</p>
      <textarea className="iv-answer" rows={16} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your CV here…" />
      <div className="exercise__actions">
        <button className="btn btn--primary btn--sm" onClick={() => onSave(text)}>
          Save ({n} question{n === 1 ? "" : "s"} from your CV)
        </button>
      </div>
    </div>
  );
}
```

- [x] **Step 7: `components/InterviewerView.tsx`:**

```tsx
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { SECTIONS, cvQuestions } from "../interviewer/content";
import type { Question, Section } from "../interviewer/content/types";
import { buildQueue, sectionCounts, type AttemptSummary } from "../interviewer/schedule";
import { getCv, latestAttempts, saveAttempt, setCv } from "../interviewer/store";
import { engine } from "../practice/engine/client";
import { Timer } from "./interviewer/Timer";
import { SelfCard } from "./interviewer/SelfCard";
import { CodeCard } from "./interviewer/CodeCard";
import { VizCard } from "./interviewer/VizCard";
import { CaseCard } from "./interviewer/CaseCard";
import { CvEditor } from "./interviewer/CvEditor";

const TIMER_KEY = (s: string) => `academicos.interviewTimer.${s}`;

export function InterviewerView({ localDb }: { localDb: SqliteLocalDb }) {
  const [latest, setLatest] = useState<Map<string, AttemptSummary>>(new Map());
  const [cvText, setCvText] = useState("");
  const [editingCv, setEditingCv] = useState(false);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [timerMin, setTimerMin] = useState(0);

  const reload = async () => setLatest(await latestAttempts(localDb));
  useEffect(() => {
    void reload();
    void getCv(localDb).then(setCvText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDb]);

  const questionsFor = (s: Section): Question[] => (s.id === "cv" ? cvQuestions(cvText) : s.questions);
  const section = SECTIONS.find((s) => s.id === sectionId) ?? null;
  const byId = useMemo(() => new Map(section ? questionsFor(section).map((q) => [q.id, q]) : []), [section, cvText]);
  const current = byId.get(queue[pos] ?? "");

  function open(s: Section) {
    const ids = questionsFor(s).map((q) => q.id);
    setSectionId(s.id);
    setQueue(buildQueue(ids, latest, new Date()));
    setPos(0);
    let saved = s.timerDefaultMin;
    try {
      const v = localStorage.getItem(TIMER_KEY(s.id));
      if (v !== null) saved = Number(v);
    } catch {
      /* ignore */
    }
    setTimerMin(saved);
    if (s.id === "sql" || s.id === "python" || s.id === "dataviz") void engine.start().catch(() => {});
  }

  async function done(r: { score: number; answer: string; checked: string[] }) {
    if (!current || !section) return;
    await saveAttempt(localDb, {
      questionId: current.id,
      section: section.id,
      answer: r.answer,
      checked: r.checked,
      score: r.score,
      prevScore: latest.get(current.id)?.score ?? null,
    });
    await reload();
    setPos((p) => p + 1);
  }

  if (!section) {
    const now = new Date();
    return (
      <div className="iv">
        <h2 className="iv__heading">Interviewer</h2>
        <p className="practice-muted">Answer as you would in the room, then compare with the checklist and model answer. Low scores come back sooner.</p>
        <div className="iv-grid">
          {SECTIONS.map((s) => {
            const c = sectionCounts(questionsFor(s).map((q) => q.id), latest, now);
            return (
              <button key={s.id} className="iv-tile" onClick={() => open(s)}>
                <span className="iv-tile__title">{s.title}</span>
                <span className="iv-tile__blurb">{s.blurb}</span>
                <span className="iv-tile__counts">
                  {c.due} due · {c.fresh} new · {c.weak} weak · {c.total} total
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const showCvEditor = section.id === "cv" && (editingCv || cvText.trim() === "");

  return (
    <div className="iv">
      <header className="iv__bar">
        <button className="btn btn--ghost btn--sm" onClick={() => setSectionId(null)}>
          <ArrowLeft size={13} strokeWidth={2} /> Sections
        </button>
        <strong>{section.title}</strong>
        <span className="practice-muted">
          {Math.min(pos + 1, queue.length)} / {queue.length}
        </span>
        <label className="iv__timer-pick">
          Timer
          <select
            value={timerMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTimerMin(v);
              try {
                localStorage.setItem(TIMER_KEY(section.id), String(v));
              } catch {
                /* ignore */
              }
            }}
          >
            {[0, 2, 5, 10].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "Off" : `${m} min`}
              </option>
            ))}
          </select>
        </label>
        {current && <Timer minutes={timerMin} resetKey={current.id} />}
        {section.id === "cv" && !showCvEditor && (
          <button className="btn btn--ghost btn--sm" onClick={() => setEditingCv(true)}>
            <FileText size={13} strokeWidth={2} /> Edit CV
          </button>
        )}
      </header>

      {showCvEditor ? (
        <CvEditor
          initial={cvText}
          onSave={(text) =>
            void setCv(localDb, text).then(() => {
              setCvText(text);
              setEditingCv(false);
              const ids = cvQuestions(text).map((q) => q.id);
              setQueue(buildQueue(ids, latest, new Date()));
              setPos(0);
            })
          }
        />
      ) : !current ? (
        <div className="iv-card">
          <p className="iv-prompt">Nothing due in this section right now — well done. Come back later, or pick another section.</p>
        </div>
      ) : current.kind === "self" ? (
        <SelfCard key={current.id} question={current} onDone={(r) => void done(r)} />
      ) : current.kind === "code" ? (
        <CodeCard key={current.id} question={current} onDone={(r) => void done(r)} />
      ) : current.kind === "viz" ? (
        <VizCard key={current.id} question={current} onDone={(r) => void done(r)} />
      ) : (
        <CaseCard key={current.id} question={current} onDone={(r) => void done(r)} />
      )}
    </div>
  );
}
```

- [x] **Step 8: Wire it into `App.tsx`.**
  1. Import `InterviewerView`, and add `MessagesSquare` to the lucide imports.
  2. Add `| "interviewer"` to the `View` union.
  3. Add the nav item `{ id: "interviewer", label: "Interviewer", Icon: MessagesSquare },` after the Practice one.
  4. Add a branch before the final Timetable `) : (`:

```tsx
      ) : view === "interviewer" ? (
        <main className="app-main app-main--interviewer">
          <InterviewerView localDb={localDb} />
        </main>
```

- [x] **Step 9: Append styles** to `apps/desktop/src/App.css`:

```css
/* ============================================================
   Interviewer
   ============================================================ */
.iv { max-width: 900px; margin: 0 auto; padding: var(--space-4) var(--space-5) var(--space-8); }
.iv__heading { margin: 0 0 var(--space-2); }
.iv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-3); margin-top: var(--space-4); }
.iv-tile { display: flex; flex-direction: column; gap: 6px; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); color: var(--ink); text-align: left; cursor: pointer; }
.iv-tile:hover { border-color: var(--accent); }
.iv-tile__title { font-weight: 700; }
.iv-tile__blurb { color: var(--ink-secondary); font-size: var(--text-sm); }
.iv-tile__counts { color: var(--muted); font-size: var(--text-xs); }
.iv__bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
.iv__timer-pick { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-xs); color: var(--muted); }
.iv__timer-pick select { background: var(--surface-2); color: var(--ink); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.iv-timer { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--ink-secondary); }
.iv-timer.is-up { color: var(--danger); }
.iv-card { padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
.iv-card h4 { margin: var(--space-4) 0 var(--space-2); font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
.iv-prompt { margin: 0 0 var(--space-3); font-size: var(--text-md); font-weight: 600; line-height: 1.5; }
.iv-answer { display: block; width: 100%; margin-bottom: var(--space-3); padding: var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--surface-2); color: var(--ink); font: inherit; line-height: 1.5; resize: vertical; }
.iv-model { line-height: 1.6; }
.iv-checklist, .iv-mistakes { margin: 0; padding-left: 1.2em; line-height: 1.7; }
.iv-checklist { list-style: none; padding-left: 0; }
.iv-score { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-4); font-size: var(--text-sm); }
.iv-score__btn { width: 34px; height: 34px; border: 1px solid var(--border-strong); border-radius: var(--radius-full); background: var(--surface-2); color: var(--ink); font-weight: 700; cursor: pointer; }
.iv-score__btn.is-suggested { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-tint-strong); }
.iv-score__btn:hover { background: var(--accent); color: var(--on-accent); }
.iv-viz { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3); }
.iv-viz figure { margin: 0; }
.iv-viz figcaption, .iv-exhibit figcaption { font-size: var(--text-xs); color: var(--muted); margin-bottom: 4px; }
.iv-case__title { margin: 0 0 var(--space-2); }
.iv-stages { display: flex; gap: var(--space-2); list-style: none; padding: 0; margin: 0 0 var(--space-3); font-size: var(--text-xs); }
.iv-stages li { padding: 3px 10px; border-radius: var(--radius-full); background: var(--surface-2); color: var(--muted); }
.iv-stages li.is-current { background: var(--accent); color: var(--on-accent); }
.iv-stages li.is-done { color: var(--success); }
.iv-ask { font-weight: 600; }
.iv-exhibit { margin: var(--space-3) 0; }
```

- [x] **Step 10: Typecheck + tests.**
  - `cd apps/desktop; npx tsc --noEmit`.
  - From `packages/core`: `npx vitest run --root ../../apps/desktop/src/interviewer --globals`.

---

### Task 5: Build and verify

- [x] **Step 1:** Ask the user to quit from the tray, confirm it's closed, build, then launch with CDP (as in the other plans). Save `cdp.mjs` from the GD Prep plan's Appendix.
- [x] **Step 2: Every SQL and Python solution passes.** Script it with CDP. Open Interviewer → SQL. For each question, set the textarea to `solution` (using the native value setter + `input` event), click Check, and expect "Correct!", then move on (the card auto-advances). Repeat for Python.
  - Scripting clicks records attempts with score 5 in the user's local data. **Ask the user first** whether that's OK, or run it and then tell them. It only affects the "due" counts: those questions reappear in 21 days.
  - **Fix content, never the checker,** when one fails.
- [x] **Step 3: A wrong SQL answer.** For `iq-sql-01`, submit `SELECT MAX(salary) FROM employees;`. **Expected:** "Correct!" does **not** appear, and a diff message shows.
- [x] **Step 4: Self-graded flow.** Open HR, answer `hr-01` briefly, Submit, tick 3 of 5, and click the suggested score.
  - Read via IPC: `SELECT question_id, score, next_due_at FROM interview_attempts_local ORDER BY attempted_at DESC LIMIT 1`.
  - **Expected:** `hr-01`, the chosen score, and `next_due_at` about 4 days out for score 3, or about 7 for 4.
- [x] **Step 5: Viz build-it.** Open `dv-02`. The reference image renders. Paste the reference code as the answer and Run. Both images show, and the checklist appears.
- [x] **Step 6: CV.** In the CV section, paste 3 sample lines (not the user's real CV). Save. The count matches `cvPrompts`, and questions appear after the 10 generic ones. Then **clear the sample text** so the user starts clean: open Edit CV, empty it, Save.
- [x] **Step 7: Offline.** Every step above worked without network. The engine loads only from `http://tauri.localhost` (see the Practice plan's diagnostics hook).
- [ ] **Step 8: Ask the user** to try one full case (`case-01`) and one HR question. Get their feedback on the content quality before docs.

---

### Task 6: Documentation

- [x] **CLAUDE.md:** add an "Interviewer (built <date>)" bullet covering:
  - the sections;
  - self-grading and the scoring rules;
  - the intervals and mastered rule;
  - migration 11;
  - the reuse of the Practice engine and checker;
  - that content is original and lives in `interviewer/content/`;
  - that the CV is local-only;
  - the test command `npx vitest run --root ../../apps/desktop/src/interviewer --globals`.
- [x] **Memory:** a new `project_interviewer.md` plus its MEMORY.md pointer.
- [x] **LEARNING.md:** a short "Interviewer" section. Explain spaced repetition, why self-grading with checklists works without AI, and how SQL answers are checked by comparing result sets.
- [ ] **Report to the user.** Nothing is committed.
