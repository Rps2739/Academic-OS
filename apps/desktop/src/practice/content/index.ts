import type { Lesson, Track } from "./types";

const modules = import.meta.glob<{ lesson: Lesson }>("./{sql,python}/*.ts", { eager: true });

export const LESSONS: Lesson[] = Object.keys(modules)
  .sort()
  .map((k) => modules[k]!.lesson);

export const lessonsFor = (track: Track) => LESSONS.filter((l) => l.track === track);
