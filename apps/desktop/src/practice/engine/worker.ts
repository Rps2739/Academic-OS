// Practice-lab engine: Pyodide in a dedicated module worker. Workers get
// no window.__TAURI_INTERNALS__, so learner code can't reach Tauri IPC,
// the app's database or the filesystem. Everything loads from this app's
// own origin (/pyodide/, /practice-datasets/) — nothing from the internet.
import { HARNESS } from "./harness.py.ts";
import type { EngineRequest, EngineResponse } from "./protocol";

interface PyCallable {
  (...args: unknown[]): unknown;
}
interface Pyodide {
  loadPackage(names: string | string[]): Promise<unknown>;
  loadPackagesFromImports(code: string): Promise<unknown>;
  unpackArchive(data: ArrayBuffer, format: string): void;
  runPythonAsync(code: string): Promise<unknown>;
  setStdout(o: { batched: (s: string) => void }): void;
  setStderr(o: { batched: (s: string) => void }): void;
  globals: { get(name: string): PyCallable };
  FS: { mkdirTree(path: string): void; writeFile(path: string, data: string): void };
}

const ctx = self as unknown as {
  location: Location;
  performance: Performance;
  postMessage(m: EngineResponse): void;
  onmessage: ((e: MessageEvent<EngineRequest>) => void) | null;
};

const origin = ctx.location.origin;
const SEABORN_WHEEL = `${origin}/pyodide/seaborn-0.13.2-py3-none-any.whl`;
let py: Pyodide | null = null;
let pandasLoaded = false;
let seabornLoaded = false;
let stdout: string[] = [];
let stderr: string[] = [];

async function init(): Promise<void> {
  const mod = (await import(/* @vite-ignore */ `${origin}/pyodide/pyodide.mjs`)) as {
    loadPyodide(o: { indexURL: string }): Promise<Pyodide>;
  };
  py = await mod.loadPyodide({ indexURL: `${origin}/pyodide/` });
  py.setStdout({ batched: (s) => stdout.push(s) });
  py.setStderr({ batched: (s) => stderr.push(s) });
  await py.runPythonAsync(HARNESS);
  const manifest = await (await fetch(`${origin}/practice-datasets/manifest.json`)).json();
  py.FS.mkdirTree("/data");
  for (const t of manifest.tables as { file: string }[]) {
    py.FS.writeFile(`/data/${t.file}`, await (await fetch(`${origin}/practice-datasets/${t.file}`)).text());
  }
  py.globals.get("_aos_seed")(JSON.stringify(manifest));
}

async function ensurePackagesFor(code: string): Promise<void> {
  const p = py!;
  if (!pandasLoaded) {
    await p.loadPackage(["numpy", "pandas"]); // load() returns DataFrames
    pandasLoaded = true;
  }
  await p.loadPackagesFromImports(code);
  if (!seabornLoaded && /\b(import|from)\s+seaborn\b/.test(code)) {
    await p.loadPackage(["matplotlib", "scipy"]);
    // seaborn isn't in Pyodide's own package set: install the pinned, checksum-verified
    // wheel that scripts/fetch-pyodide.mjs saved next to the engine.
    p.unpackArchive(await (await fetch(SEABORN_WHEEL)).arrayBuffer(), "wheel");
    seabornLoaded = true;
  }
}

async function handle(req: EngineRequest): Promise<unknown> {
  if (req.type === "init") {
    if (!py) await init();
    return null;
  }
  if (!py) throw new Error("Engine not started");
  if (req.type === "diagnostics") {
    return {
      resources: ctx.performance.getEntriesByType("resource").map((e) => e.name),
      tauri: typeof (self as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
    };
  }
  if (req.type === "reset") {
    py.globals.get("_aos_reset")();
    return null;
  }
  if (req.type === "datasets") return JSON.parse(String(py.globals.get("_aos_datasets")()));
  if (req.type === "sqlCheck") return JSON.parse(String(py.globals.get("_aos_sql_check")(req.code, req.reference)));

  // run
  stdout = [];
  stderr = [];
  try {
    if (req.mode === "sql") {
      const table = JSON.parse(String(py.globals.get("_aos_run_sql")(req.code)));
      return { ok: true, stdout: stdout.join("\n"), stderr: stderr.join("\n"), table, value: null, images: [], test: null };
    }
    await ensurePackagesFor(`${req.code}\n${req.tests ?? ""}`);
    const out = JSON.parse(String(await py.globals.get("_aos_run_py")(req.code, req.tests ?? "")));
    return { ok: true, stdout: stdout.join("\n"), stderr: stderr.join("\n"), ...out };
  } catch (err) {
    return {
      ok: false,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
      error: err instanceof Error ? err.message : String(err),
      table: null,
      value: null,
      images: [],
      test: req.tests ? { passed: false, message: "Your code raised an error before the checks ran." } : null,
    };
  }
}

ctx.onmessage = (e) => {
  const req = e.data;
  handle(req).then(
    (payload) => ctx.postMessage({ id: req.id, ok: true, payload }),
    (err) => ctx.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  );
};
