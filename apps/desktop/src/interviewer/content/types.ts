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
