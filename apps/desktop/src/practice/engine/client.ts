import type { DatasetInfo, EngineRequest, EngineResponse, Mode, RunResult, SqlCheckResult } from "./protocol";

export type EngineStatus = "idle" | "starting" | "ready" | "busy" | "error";

// Distributive Omit so each union member keeps its own fields.
type RequestBody = EngineRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

/** Main-thread handle to the Practice engine worker. One per app session. */
class PracticeEngine {
  private worker: Worker | null = null;
  private starting: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private listeners = new Set<(s: EngineStatus) => void>();
  status: EngineStatus = "idle";
  lastError = "";

  onStatus(fn: (s: EngineStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(s: EngineStatus) {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }

  private send<T>(req: RequestBody): Promise<T> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error("Engine is not running"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ ...req, id });
    });
  }

  start(): Promise<void> {
    if (this.starting) return this.starting;
    this.setStatus("starting");
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<EngineResponse>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.payload);
      else p.reject(new Error(e.data.error ?? "Engine error"));
    };
    worker.onerror = (e) => {
      this.lastError = e.message || "The Python engine failed to start.";
      this.setStatus("error");
    };
    this.worker = worker;
    this.starting = this.send<null>({ type: "init" }).then(
      () => this.setStatus("ready"),
      (err: Error) => {
        this.lastError = err.message;
        this.setStatus("error");
        this.starting = null;
        throw err;
      }
    );
    return this.starting;
  }

  private async busy<T>(fn: () => Promise<T>): Promise<T> {
    await this.start();
    this.setStatus("busy");
    try {
      return await fn();
    } finally {
      if (this.worker) this.setStatus("ready");
    }
  }

  run(mode: Mode, code: string, tests?: string): Promise<RunResult> {
    return this.busy(() => this.send<RunResult>(tests ? { type: "run", mode, code, tests } : { type: "run", mode, code }));
  }

  sqlCheck(code: string, reference: string): Promise<SqlCheckResult> {
    return this.busy(() => this.send<SqlCheckResult>({ type: "sqlCheck", code, reference }));
  }

  datasets(): Promise<DatasetInfo[]> {
    return this.busy(() => this.send<DatasetInfo[]>({ type: "datasets" }));
  }

  resetData(): Promise<void> {
    return this.busy(() => this.send<void>({ type: "reset" }));
  }

  diagnostics(): Promise<{ resources: string[]; tauri: string }> {
    return this.busy(() => this.send({ type: "diagnostics" }));
  }

  /** Kills a runaway run (e.g. an infinite loop). The next call restarts the engine. */
  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.starting = null;
    for (const p of this.pending.values()) p.reject(new Error("Stopped"));
    this.pending.clear();
    this.setStatus("idle");
  }
}

export const engine = new PracticeEngine();
