import type { TableData } from "../check";

export type Mode = "sql" | "python";

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  table?: TableData | null;
  value?: string | null;
  images: string[];
  test?: { passed: boolean; message?: string } | null;
}

export interface SqlCheckResult {
  ok: boolean;
  error?: string;
  user?: TableData;
  expected?: TableData;
}

export interface DatasetInfo {
  name: string;
  description: string;
  columns: { name: string; type: string }[];
  sample: TableData;
}

export type EngineRequest =
  | { id: number; type: "init" }
  | { id: number; type: "run"; mode: Mode; code: string; tests?: string }
  | { id: number; type: "sqlCheck"; code: string; reference: string }
  | { id: number; type: "datasets" }
  | { id: number; type: "reset" }
  | { id: number; type: "diagnostics" };

export type EngineResponse = { id: number; ok: boolean; error?: string; payload?: unknown };
