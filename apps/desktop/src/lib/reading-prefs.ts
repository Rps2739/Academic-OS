const KEYS = {
  theme: "academicos.theme",        // "dark" | "light"
  font:  "academicos.readingFont",  // "sans" | "serif"
  scale: "academicos.readingScale", // number as string
  newsTab: "academicos.newsTab",    // last-selected News category key
} as const;

const CUSTOM_FEEDS_KEY = "academicos.newsCustomFeeds"; // JSON: Record<category, string[]>
const EXPANDED_FOLDERS_KEY = "academicos.notesExpandedFolders"; // JSON: string[] of node ids

export type ThemeName = "dark" | "light";
export type ReadingFont = "sans" | "serif";

export function readPref<T extends string>(key: keyof typeof KEYS, fallback: T): T {
  try { return (localStorage.getItem(KEYS[key]) as T) ?? fallback; } catch { return fallback; }
}

export function writePref(key: keyof typeof KEYS, value: string): void {
  try { localStorage.setItem(KEYS[key], value); } catch { /* private mode / quota */ }
}

/** Call once in the main window entry point, before React renders. */
export function applyStoredTheme(): void {
  const theme = readPref("theme", "dark" as ThemeName);
  document.documentElement.setAttribute("data-theme", theme);
}

/** User-added RSS feed URLs per News category. Per-device UI config (same
 * rationale as theme/font/scale) — not synced user data. */
export function readCustomFeeds(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(CUSTOM_FEEDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeCustomFeeds(feeds: Record<string, string[]>): void {
  try {
    localStorage.setItem(CUSTOM_FEEDS_KEY, JSON.stringify(feeds));
  } catch {
    /* private mode / quota */
  }
}

/** Which Notes-tree folders are open. The tree unmounts whenever another
 * view is shown, so without this every folder snapped shut on each trip
 * to News/Tasks/etc. Per-device UI state, not synced. */
export function readExpandedFolders(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXPANDED_FOLDERS_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeExpandedFolders(ids: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify([...ids]));
  } catch {
    /* private mode / quota */
  }
}
