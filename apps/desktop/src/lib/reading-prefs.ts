const KEYS = {
  theme: "academicos.theme",        // "dark" | "light"
  font:  "academicos.readingFont",  // "sans" | "serif"
  scale: "academicos.readingScale", // number as string
} as const;

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
