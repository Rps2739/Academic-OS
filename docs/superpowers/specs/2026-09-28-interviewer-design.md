# Interviewer — design

Sub-project 4 of 4 (Reading → Reliability → Practice lab → **Interviewer**). A new **Interviewer** nav item for placement interview practice. It's **self-graded with no AI**: the user declined letting the app reach a local AI, and it must work offline with no new online services. SQL, Python and chart-building answers are checked by running them in the Practice lab engine.

**Depends on** the Practice lab's `practice/engine/client.ts`, `practice/check.ts` and datasets.

## Sections

| Section | Checking |
|---|---|
| Case interviews | staged, self-graded |
| Guesstimates | self-graded |
| Power BI | self-graded |
| Data visualisation | self-graded; "build it" tasks run in the engine |
| SQL | auto-checked |
| Python | auto-checked |
| CV | self-graded, questions generated from the pasted CV |
| HR / standard ("hygiene") | self-graded |

## Question flow

1. Pick a section. The section home shows:
   - **Due** (questions scheduled for today);
   - **Weak spots** (last score ≤ 2);
   - **New** (never attempted).
2. "Start" serves due questions first, then new, then weak. An optional timer can be set per section (off / 2 / 5 / 10 min, remembered in `localStorage`).
3. The user types an answer and submits.
4. **Auto-checked sections** show correct or incorrect with the diff from `check.ts`. For SQL/Python the score is 5 if correct first try, 3 if correct after retries, 1 if revealed.
5. **Self-graded sections** reveal:
   - a **key-points checklist** (the user ticks what they covered);
   - a **model answer**;
   - **common mistakes**.

   The user then scores 1–5. The ticked fraction pre-suggests a score, which the user can override.
6. **Scheduling** (`interviewer/schedule.ts`, pure): next due = today + interval by score. Score 1 → 1 day, 2 → 2, 3 → 4, 4 → 7, 5 → 21. A question at score 5 twice in a row is marked "mastered" and moves to 45 days.

## Section content

**Case interviews:** about 10 staged cases (profitability, market entry, pricing, growth, M&A, operations). Each case has four stages:
1. **Clarifying questions** (the user lists theirs, then sees the model list).
2. **Structure** (the user writes a framework, then sees the model tree).
3. **Analysis**: data exhibits are revealed on request, as short tables; the user computes/interprets, then sees the model analysis.
4. **Recommendation** (the user writes it, then sees the model plus a synthesis checklist).

Each stage is self-scored; the case score is the average.

**Guesstimates:** about 15, e.g. market sizing for Indian contexts. The checklist covers: approach stated, segmentation, assumptions sanity-checked, maths shown, sense-check at the end.

**Power BI:**
- Concepts: data model, star vs snowflake schema, relationships and cross-filter direction, Power Query vs DAX, measures vs calculated columns, row-level security, refresh/gateways, performance basics.
- DAX: the user writes the measure (CALCULATE, filter context, ALL/ALLEXCEPT, time intelligence such as YTD/SAMEPERIODLASTYEAR, DIVIDE, RANKX), then compares it with the model answer and explanation. There's no offline DAX engine, so it's self-graded.
- Dashboard-design scenarios: "A sales head wants X — which visuals, slicers and KPIs, and why?"

**Data visualisation:**
- **Judgement (self-graded).** Choosing the chart for a question (trend, comparison, composition, distribution, relationship); spotting problems in a *described* chart (truncated axis, 12-slice pie, dual axes, rainbow palette, 3D); storytelling for executives; "how would you show X to a CXO?".
- **Build it (hands-on).** "Recreate this chart from the dataset" in matplotlib/seaborn using the engine. The reference image is **generated at build time from reference code** by the same engine, so there are no copied images. The user's chart renders beside it, and they self-grade on a checklist: chart type, correct aggregation, sorted, axis labels, title, readable colours, no chart-junk.

**SQL and Python:** about 20 each. Interview-style tasks over the Practice datasets (top-N per group, second-highest salary, running totals, YoY growth, retention/cohort; pandas groupby/merge/pivot, cleaning, simple functions). Each is auto-checked through `check.ts`, and a model solution is shown after solving or revealing.

**CV:**
- The user pastes their CV text once. It's stored local-only and editable any time.
- Each non-empty line of 5+ words becomes a prompt: "Walk me through this: '<line>'". Checklist: context, what *you* did, measurable result, what you learned, why it matters for the role.
- Plus about 10 generic CV questions ("Walk me through your CV", "Biggest achievement", "A gap or change you'd explain", …).

**HR / standard:** about 30 ("Tell me about yourself", "Why MBA", "Why this company/role", strengths/weaknesses, failure, conflict, leadership, teamwork, "Where in 5 years", salary expectations). Each has a checklist, a model answer structure (STAR where relevant) and common mistakes.

**All content is original writing** in typed TS data under `apps/desktop/src/interviewer/content/<section>.ts`. No text is copied from prep sites or books.

## Storage

`lib.rs` migration **11**, local-only (not in `SYNC_TABLES`; covered by the daily backup):
- `interview_attempts_local`: `id` PK, `question_id`, `section`, `answer`, `checked_points` (JSON text), `score`, `attempted_at`, `next_due_at`. One row per attempt; the latest per question drives scheduling.
- `interview_cv_local`: single row, `id = 'cv'`, `text`, `updated_at`.

## Files

**New:**
- `apps/desktop/src/components/InterviewerView.tsx`
- `apps/desktop/src/interviewer/content/*.ts`
- `apps/desktop/src/interviewer/schedule.ts` (+ `schedule.test.ts`)
- `apps/desktop/src/interviewer/store.ts`
- `apps/desktop/src/interviewer/cv.ts` (+ test: line → prompt extraction)

**Edited:** `App.tsx` (`View` union + nav item, icon `MessagesSquare`), `lib.rs` (migration 11), `App.css`.

**Reuses:** `practice/engine/client.ts`, `practice/check.ts`, the practice datasets.

## Testing

- **vitest:** `schedule.ts` (score → interval, the mastered rule, due/weak/new ordering); `cv.ts` (short or empty lines skipped, bullets stripped).
- **CDP (live):**
  - an SQL question passes with a correct answer and fails with a diff on a wrong one;
  - a self-graded HR question stores its checklist, score and the correct `next_due_at`;
  - a "build it" viz task renders both images;
  - pasting a CV creates the expected prompts;
  - everything works with the network disabled.
- **User:** tries one full staged case and gives feedback on the question quality.
