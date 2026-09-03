import type { Clock } from "./types";

/**
 * A shared, monotonically-increasing clock for tests. Using one instance
 * across a test's remote and every simulated local device means call order
 * (which, in synchronous test code, is the order the test author wrote)
 * equals timestamp order — deterministic conflict outcomes instead of races
 * against real wall-clock resolution.
 */
export function createFakeClock(startEpochMs = Date.UTC(2026, 0, 1)): Clock {
  let t = startEpochMs;
  return () => new Date((t += 1000)).toISOString();
}
