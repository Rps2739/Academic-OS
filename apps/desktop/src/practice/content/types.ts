export type Track = "sql" | "python";

export interface Exercise {
  /** Globally unique, e.g. "sql-03-e2". Stored in practice_progress_local. */
  id: string;
  prompt: string;
  starter: string;
  solution: string;
  /** SQL only: the result must match in this exact order. */
  ordered?: boolean;
  /** Python only: statements run after the learner's code; assert with a helpful message. */
  tests?: string;
  hint?: string;
}

export interface Lesson {
  id: string;
  track: Track;
  title: string;
  /** Plain text. Blank line = new paragraph; lines starting "- " = bullets; `backticks` = inline code. */
  body: string;
  /** Runnable example shown in the "Try it" editor. */
  example: string;
  exercises: Exercise[];
}
