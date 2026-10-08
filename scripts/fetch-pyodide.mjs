// One-time developer setup for the Practice lab's offline Python engine.
// Downloads the pinned Pyodide release's core files + the wheels needed for
// numpy/pandas/matplotlib/scipy/scikit-learn (dependencies resolved from
// the release's own pyodide-lock.json) + seaborn from PyPI (pure Python;
// not in Pyodide's set). Every file is SHA-256 verified. Output goes to
// apps/desktop/public/pyodide/ (gitignored). The app itself never
// downloads anything at runtime.
// Run: node scripts/fetch-pyodide.mjs
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "314.0.7";
const BASE = `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/`;
// Pinned 2026-09-29 from the official release (MPL-2.0).
const CORE = {
  "pyodide.mjs": "6f1d60f7bf529beb300f0f47983c921d3982363640ba20af0e38efdddbc66109",
  "pyodide.asm.mjs": "f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635",
  "pyodide.asm.wasm": "cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6",
  "python_stdlib.zip": "fa1957e5777068fc4f7437f96d860ae2fbe9c19732ba06c84e004ec16dd7dd7a",
  "pyodide-lock.json": "5dc2fc119108bc148c7457dc86e7675b5c87e1cafd420b9c34c1eaef7b36c010",
};
const ROOT_PACKAGES = ["numpy", "pandas", "matplotlib", "scipy", "scikit-learn"];
const SEABORN = { name: "seaborn", version: "0.13.2", file: "seaborn-0.13.2-py3-none-any.whl", sha256: "636f8336facf092165e27924f223d3c62ca560b1f2bb5dff7ab7fad265361987" };

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "desktop", "public", "pyodide");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function download(url, expected, dest) {
  if (existsSync(dest) && sha256(readFileSync(dest)) === expected) {
    console.log("ok (cached)", dest.split(/[\\/]/).pop());
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== expected) throw new Error(`CHECKSUM MISMATCH for ${url}\n expected ${expected}\n got      ${got}`);
  writeFileSync(dest, buf);
  console.log("ok", dest.split(/[\\/]/).pop(), `${(buf.length / 1e6).toFixed(1)} MB`);
}

mkdirSync(OUT, { recursive: true });
for (const [file, hash] of Object.entries(CORE)) await download(BASE + file, hash, join(OUT, file));

const lock = JSON.parse(readFileSync(join(OUT, "pyodide-lock.json"), "utf8"));
const want = new Set();
const queue = [...ROOT_PACKAGES];
while (queue.length) {
  const name = queue.pop();
  if (want.has(name)) continue;
  const entry = lock.packages[name];
  if (!entry) throw new Error(`Package ${name} is not in Pyodide ${VERSION}'s lock file`);
  want.add(name);
  queue.push(...(entry.depends ?? []));
}
for (const name of [...want].sort()) {
  const entry = lock.packages[name];
  await download(BASE + entry.file_name, entry.sha256, join(OUT, entry.file_name));
}

// seaborn: confirm the pinned file/hash against PyPI's own metadata, then fetch.
const meta = await (await fetch(`https://pypi.org/pypi/${SEABORN.name}/${SEABORN.version}/json`)).json();
const wheel = meta.urls.find((u) => u.filename === SEABORN.file);
if (!wheel || wheel.digests.sha256 !== SEABORN.sha256) throw new Error("seaborn wheel metadata does not match the pinned hash");
await download(wheel.url, SEABORN.sha256, join(OUT, SEABORN.file));

writeFileSync(join(OUT, "README.txt"), `Pyodide ${VERSION} (MPL-2.0) + wheels for ${[...want].sort().join(", ")} + ${SEABORN.file}.\nFetched by scripts/fetch-pyodide.mjs. Not committed.\n`);
console.log(`\nDone: ${Object.keys(CORE).length} core files, ${want.size} Pyodide packages, seaborn.`);
