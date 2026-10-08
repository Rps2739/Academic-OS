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
