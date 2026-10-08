# Practice Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, **inline in this session (no subagents)**. Steps use checkbox (`- [ ]`) syntax — tick each one in this file as you finish it.

**Goal:** A new **Practice** nav section with live, fully offline SQL and Python practice:
- W3Schools/GfG-style original lessons, each with a "Try it" editor and auto-checked exercises.
- Built-in datasets.
- Python libraries pandas, numpy, matplotlib, scikit-learn, seaborn and scipy.

**Architecture:**
- **Engine:** Pyodide 314.0.7 (CPython 3.14 → WebAssembly, MPL-2.0) runs inside a module **Web Worker**. The worker has no Tauri IPC, so user code can't reach the app's database or files. **Stop** calls `worker.terminate()`.
- **SQL:** runs in the same worker through Python's standard-library `sqlite3`, against an in-memory database seeded from committed CSVs.
- **Offline:** every engine file is fetched **once at setup time** by a checksum-verifying script into `apps/desktop/public/pyodide/` (gitignored). At runtime nothing is downloaded.
- **Progress:** stored in a local-only SQLite table.

**Tech Stack:** Pyodide 314.0.7, Vite 7 module workers, React 19, TypeScript, tauri-plugin-sql, vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-practice-lab-design.md`.

This plan updates the spec in three places, based on facts verified 2026-09-29:
- **seaborn** isn't in Pyodide 314's package set. It's pure Python, so the setup script fetches the official `seaborn-0.13.2-py3-none-any.whl` from PyPI once, checksum-verified.
- **Palmer Penguins is dropped.** Machine-learning lessons use scikit-learn's **bundled** datasets (`load_iris`, `load_wine`, `load_diabetes`, `load_breast_cancer`). They ship inside the wheel, work offline and are licence-clean.
- **Reference chart images** are rendered from code by the engine when first shown, not pre-generated.

## Global Constraints

- **Read `CLAUDE.md` first.** Its Operational constraints are binding.
- **Free, offline, no new online services, no accounts.** The only network use is the **one-time developer setup fetch** in Task 2, from `cdn.jsdelivr.net` (Pyodide's official CDN) and `pypi.org`/`files.pythonhosted.org` (seaborn), with checksums verified. The runtime must never fetch anything off-origin.
- **No new npm or cargo dependencies.** Pyodide is loaded as static files.
- **CSP:**
  - The **only** change allowed is adding `script-src 'self' 'wasm-unsafe-eval'` to `apps/desktop/src-tauri/tauri.conf.json`.
  - **Stop-and-ask rule:** if the engine fails because of CSP (for example it needs `'unsafe-eval'`), stop and explain it to the user in plain language. Never widen the CSP on your own.
  - Background: `pyodide.asm.mjs` does contain `eval(` for Emscripten EM_ASM in side modules. Whether a worker is subject to the page CSP in Tauri must be verified empirically.
- **Security:**
  - User code runs only in the worker.
  - **Never** run user code on the main thread, and never pass Tauri objects into the worker.
  - Render output as plain text, tables and `<img src="data:image/png…">` only. **Never** `dangerouslySetInnerHTML`.
- **Licences to disclose in docs:** Pyodide MPL-2.0; numpy, pandas, scipy, scikit-learn and seaborn BSD-3; matplotlib PSF-style. Lesson text and datasets are original (datasets are synthetic, seeded).
- **Content rule:** every lesson and question is **original writing**. Never copy text from W3Schools, GeeksforGeeks, docs or books.
- **Never kill the app.** Ask the user to quit from the tray, then confirm with `Get-Process desktop`.
- **Build:** only `./node_modules/.bin/tauri.CMD build --no-bundle`.
- **Never write to the live SQLite file directly.**
- **Don't commit** unless asked.
- **No full-desktop screenshots.**
- **Plain-language updates.**

## File map

| File | Status | Responsibility |
|---|---|---|
| `scripts/generate-practice-datasets.mjs` | create | seeded synthetic "Bharat Retail" CSVs + manifest |
| `apps/desktop/public/practice-datasets/*` | generated, **committed** | 7 CSVs + `manifest.json` (small) |
| `scripts/fetch-pyodide.mjs` | create | one-time checksum-verified download of engine files |
| `apps/desktop/public/pyodide/` | generated, **gitignored** | engine core + wheels |
| `.gitignore` | modify | ignore `apps/desktop/public/pyodide/` |
| `apps/desktop/src-tauri/tauri.conf.json` | modify | CSP `script-src` |
| `apps/desktop/src/practice/check.ts` (+ `check.test.ts`) | create | pure result-set comparison |
| `apps/desktop/src/practice/engine/protocol.ts` | create | worker message types |
| `apps/desktop/src/practice/engine/harness.py.ts` | create | the Python harness source, as a TS string |
| `apps/desktop/src/practice/engine/worker.ts` | create | Pyodide worker |
| `apps/desktop/src/practice/engine/client.ts` | create | main-thread engine singleton |
| `apps/desktop/src/practice/content/types.ts` | create | lesson types |
| `apps/desktop/src/practice/content/sql/*.ts`, `python/*.ts`, `index.ts` | create | lessons |
| `apps/desktop/src/practice/store.ts` | create | progress table access |
| `apps/desktop/src-tauri/src/lib.rs` | modify | migration **10** |
| `apps/desktop/src/components/practice/*.tsx` | create | CodeEditor, ResultView, LessonText, ExerciseCard, DatasetsPanel |
| `apps/desktop/src/components/PracticeView.tsx` | create | the Practice screen |
| `apps/desktop/src/App.tsx` | modify | nav item + view |
| `apps/desktop/vite.config.ts` | modify | `worker: { format: "es" }` |
| `apps/desktop/src/App.css` | modify | practice styles |

---

### Task 1: Synthetic datasets

**Files:**
- Create: `scripts/generate-practice-datasets.mjs`
- Generated: `apps/desktop/public/practice-datasets/`

**Interfaces:**
- Produces: `public/practice-datasets/manifest.json` shaped as `{ "tables": [ { "name", "file", "description", "columns": [ { "name", "type": "INTEGER"|"REAL"|"TEXT" } ] } ] }`, plus one CSV per table with a header row. An empty cell means NULL.
- Tables: `regions`, `customers`, `products`, `employees`, `orders`, `order_items`, `monthly_sales`.

- [x] **Step 1: Create `scripts/generate-practice-datasets.mjs`:**

```js
// Generates the Practice lab's synthetic "Bharat Retail" dataset — an
// invented Indian e-commerce company. Seeded + deterministic: rerunning
// produces byte-identical files. Output is committed (small). No real
// people or companies; names are combined from common Indian first/last
// names. Run: node scripts/generate-practice-datasets.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "desktop", "public", "practice-datasets");

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260928);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (p) => rand() < p;
const round2 = (n) => Math.round(n * 100) / 100;
const addDays = (iso, days) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const FIRST = ["Aarav", "Vivaan", "Aditya", "Arjun", "Sai", "Rohan", "Karthik", "Ishaan", "Rahul", "Vikram", "Ananya", "Diya", "Priya", "Kavya", "Meera", "Sneha", "Aishwarya", "Pooja", "Nisha", "Lakshmi", "Harish", "Suresh", "Deepak", "Farhan", "Imran", "Zoya", "Sana", "Gurpreet", "Simran", "Tenzin", "Anjali", "Rekha", "Manoj", "Nikhil", "Divya", "Sruthi", "Varun", "Neha", "Ritu", "Abhishek"];
const LAST = ["Sharma", "Verma", "Iyer", "Reddy", "Nair", "Menon", "Patel", "Shah", "Gupta", "Das", "Banerjee", "Chatterjee", "Rao", "Pillai", "Kulkarni", "Deshpande", "Singh", "Khan", "Joshi", "Mehta", "Bose", "Mishra", "Agarwal", "Naidu", "Gowda", "Fernandes", "Dsouza", "Kapoor", "Malhotra", "Sinha"];
const fullName = () => `${pick(FIRST)} ${pick(LAST)}`;

const REGIONS = [
  { region_id: 1, region_name: "North", cities: [["Delhi", "Delhi"], ["Chandigarh", "Chandigarh"], ["Jaipur", "Rajasthan"], ["Lucknow", "Uttar Pradesh"]] },
  { region_id: 2, region_name: "South", cities: [["Bengaluru", "Karnataka"], ["Chennai", "Tamil Nadu"], ["Hyderabad", "Telangana"], ["Kochi", "Kerala"]] },
  { region_id: 3, region_name: "West", cities: [["Mumbai", "Maharashtra"], ["Pune", "Maharashtra"], ["Ahmedabad", "Gujarat"], ["Panaji", "Goa"]] },
  { region_id: 4, region_name: "East", cities: [["Kolkata", "West Bengal"], ["Bhubaneswar", "Odisha"], ["Patna", "Bihar"], ["Guwahati", "Assam"]] },
  { region_id: 5, region_name: "Central", cities: [["Bhopal", "Madhya Pradesh"], ["Indore", "Madhya Pradesh"], ["Nagpur", "Maharashtra"], ["Raipur", "Chhattisgarh"]] },
];

const CATALOG = [
  ["Electronics", [["Mobiles", ["Smartphone 5G", "Smartphone Lite", "Feature Phone"], 7999, 49999], ["Laptops", ["Ultrabook 14", "Gaming Laptop 15", "Student Laptop"], 32999, 119999], ["Accessories", ["Wireless Earbuds", "Power Bank 20000mAh", "USB-C Charger", "Bluetooth Speaker"], 499, 4999]]],
  ["Home", [["Kitchen", ["Mixer Grinder", "Pressure Cooker 5L", "Non-stick Tawa"], 799, 5999], ["Furniture", ["Study Table", "Office Chair", "Bookshelf"], 2999, 14999], ["Decor", ["Wall Clock", "Table Lamp", "Cushion Covers (Set of 5)"], 299, 2499]]],
  ["Fashion", [["Men", ["Cotton Kurta", "Formal Shirt", "Denim Jeans"], 599, 2999], ["Women", ["Silk Saree", "Kurti Set", "Handbag"], 799, 8999], ["Footwear", ["Running Shoes", "Leather Sandals", "Sneakers"], 699, 4999]]],
  ["Grocery", [["Staples", ["Basmati Rice 5kg", "Toor Dal 1kg", "Atta 10kg"], 120, 899], ["Snacks", ["Masala Chips", "Roasted Makhana", "Dry Fruit Mix"], 40, 699], ["Beverages", ["Assam Tea 500g", "Filter Coffee 500g", "Mango Drink 1L"], 60, 599]]],
  ["Books", [["Fiction", ["Monsoon Letters (Novel)", "The Last Train (Novel)"], 199, 599], ["Business", ["Strategy Essentials", "Marketing Management"], 399, 1299], ["Exam Prep", ["CAT Quant Guide", "UPSC GS Manual"], 299, 999]]],
];
const BRANDS = { Electronics: ["Nova", "Zentek", "Orbit"], Home: ["Griha", "Casa", "Tulsi"], Fashion: ["Rangoli", "Urban Loom", "Stride"], Grocery: ["Annapurna", "Desi Farm", "Kaveri"], Books: ["Pustak Press", "Sahitya"] };

// ---- regions
const regions = REGIONS.map((r) => ({ region_id: r.region_id, region_name: r.region_name, head_city: r.cities[0][0] }));

// ---- products
const products = [];
for (const [category, subs] of CATALOG) {
  for (const [sub, items, lo, hi] of subs) {
    for (const item of items) {
      const unit = round2(lo + rand() * (hi - lo));
      products.push({
        product_id: products.length + 1,
        product_name: category === "Books" ? item : `${pick(BRANDS[category])} ${item}`,
        category,
        sub_category: sub,
        brand: category === "Books" ? pick(BRANDS.Books) : null,
        unit_price: unit,
        cost_price: round2(unit * (0.55 + rand() * 0.25)),
      });
    }
  }
}
for (const p of products) if (p.brand === null) p.brand = p.product_name.split(" ")[0];

// ---- customers (with a little deliberate mess for cleaning exercises)
const customers = [];
for (let i = 1; i <= 300; i++) {
  const region = pick(REGIONS);
  const [city, state] = pick(region.cities);
  let name = fullName();
  if (chance(0.02)) name = `  ${name.toLowerCase()} `;
  customers.push({
    customer_id: i,
    full_name: name,
    email: chance(0.01) ? null : `${name.trim().toLowerCase().replace(/\s+/g, ".")}${i}@example.com`,
    city: chance(0.03) ? null : city,
    state,
    region_id: region.region_id,
    segment: pick(["Consumer", "Consumer", "Consumer", "Corporate", "Small Business"]),
    signup_date: addDays("2024-01-01", int(0, 900)),
  });
}

// ---- employees (department heads have no manager)
const DEPTS = [["Sales", 15, 450000, 1400000], ["Operations", 8, 400000, 1100000], ["Marketing", 6, 500000, 1600000], ["Finance", 4, 600000, 1800000], ["HR", 3, 450000, 1200000], ["Analytics", 4, 700000, 2200000]];
const employees = [];
for (const [dept, count, lo, hi] of DEPTS) {
  const headId = employees.length + 1;
  for (let k = 0; k < count; k++) {
    const region = pick(REGIONS);
    employees.push({
      employee_id: employees.length + 1,
      full_name: fullName(),
      department: dept,
      manager_id: k === 0 ? null : headId,
      city: pick(region.cities)[0],
      hire_date: addDays("2018-04-01", int(0, 2900)),
      salary: Math.round((k === 0 ? hi : lo + rand() * (hi - lo) * 0.8) / 1000) * 1000,
    });
  }
}
const salesStaff = employees.filter((e) => e.department === "Sales").map((e) => e.employee_id);

// ---- orders + order_items (festive season Oct–Nov is busier)
const orders = [];
const orderItems = [];
while (orders.length < 2500) {
  const date = addDays("2024-07-01", int(0, 729));
  const month = Number(date.slice(5, 7));
  if (month !== 10 && month !== 11 && !chance(0.75)) continue;
  const customer = pick(customers);
  const r = rand();
  const status = r < 0.85 ? "Delivered" : r < 0.92 ? "Cancelled" : r < 0.97 ? "Returned" : "Shipped";
  const order = {
    order_id: orders.length + 1,
    customer_id: customer.customer_id,
    employee_id: pick(salesStaff),
    order_date: date,
    status,
    payment_method: chance(0.02) ? null : pick(["UPI", "UPI", "UPI", "Card", "Card", "COD", "NetBanking"]),
    region_id: customer.region_id,
  };
  orders.push(order);
  const used = new Set();
  const lines = int(1, 4);
  for (let k = 0; k < lines; k++) {
    const product = pick(products);
    if (used.has(product.product_id)) continue;
    used.add(product.product_id);
    orderItems.push({
      order_item_id: orderItems.length + 1,
      order_id: order.order_id,
      product_id: product.product_id,
      quantity: product.category === "Grocery" ? int(1, 5) : int(1, 2),
      unit_price: round2(product.unit_price * (0.95 + rand() * 0.1)),
      discount: pick([0, 0, 0, 0.05, 0.1, 0.15]),
    });
  }
}

// ---- monthly_sales (delivered orders only)
const byKey = new Map();
const productById = new Map(products.map((p) => [p.product_id, p]));
const orderById = new Map(orders.map((o) => [o.order_id, o]));
for (const it of orderItems) {
  const o = orderById.get(it.order_id);
  if (o.status !== "Delivered") continue;
  const cat = productById.get(it.product_id).category;
  const key = `${o.order_date.slice(0, 7)}|${o.region_id}|${cat}`;
  const agg = byKey.get(key) ?? { month: o.order_date.slice(0, 7), region_id: o.region_id, category: cat, revenue: 0, units: 0 };
  agg.revenue += it.quantity * it.unit_price * (1 - it.discount);
  agg.units += it.quantity;
  byKey.set(key, agg);
}
const monthlySales = [...byKey.values()]
  .map((a) => ({ ...a, revenue: round2(a.revenue) }))
  .sort((a, b) => a.month.localeCompare(b.month) || a.region_id - b.region_id || a.category.localeCompare(b.category));

// ---- write
const TABLES = [
  ["regions", "Five sales regions of Bharat Retail.", regions, { region_id: "INTEGER", region_name: "TEXT", head_city: "TEXT" }],
  ["customers", "300 customers. A few names have stray spaces/lowercase and a few cities/emails are missing — on purpose, for cleaning practice.", customers, { customer_id: "INTEGER", full_name: "TEXT", email: "TEXT", city: "TEXT", state: "TEXT", region_id: "INTEGER", segment: "TEXT", signup_date: "TEXT" }],
  ["products", "Product catalogue across five categories. Prices in INR.", products, { product_id: "INTEGER", product_name: "TEXT", category: "TEXT", sub_category: "TEXT", brand: "TEXT", unit_price: "REAL", cost_price: "REAL" }],
  ["employees", "40 employees; department heads have no manager_id. Salary is annual, INR.", employees, { employee_id: "INTEGER", full_name: "TEXT", department: "TEXT", manager_id: "INTEGER", city: "TEXT", hire_date: "TEXT", salary: "INTEGER" }],
  ["orders", "2,500 orders, Jul 2024 – Jun 2026. Oct–Nov (festive season) is busier.", orders, { order_id: "INTEGER", customer_id: "INTEGER", employee_id: "INTEGER", order_date: "TEXT", status: "TEXT", payment_method: "TEXT", region_id: "INTEGER" }],
  ["order_items", "Line items: quantity, price actually charged, and discount (0–0.15).", orderItems, { order_item_id: "INTEGER", order_id: "INTEGER", product_id: "INTEGER", quantity: "INTEGER", unit_price: "REAL", discount: "REAL" }],
  ["monthly_sales", "Delivered revenue and units per month × region × category (net of discount).", monthlySales, { month: "TEXT", region_id: "INTEGER", category: "TEXT", revenue: "REAL", units: "INTEGER" }],
];

const cell = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
mkdirSync(OUT, { recursive: true });
const manifest = { tables: [] };
for (const [name, description, rows, types] of TABLES) {
  const cols = Object.keys(types);
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
  writeFileSync(join(OUT, `${name}.csv`), csv);
  manifest.tables.push({ name, file: `${name}.csv`, description, columns: cols.map((c) => ({ name: c, type: types[c] })) });
  console.log(`${name}: ${rows.length} rows`);
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
```

- [x] **Step 2: Run it.** `node scripts/generate-practice-datasets.mjs`. Expected output:
  - `regions: 5`, `customers: 300`, `products: 44`, `employees: 40`, `orders: 2500`;
  - `order_items:` about 5000–6000, `monthly_sales:` a few hundred.

  Run it a second time and confirm with `git status` / `git diff --stat` that nothing changed (it's deterministic).

- [x] **Step 3: Sanity-check.** `head -3 apps/desktop/public/practice-datasets/orders.csv` shows a header row plus data.

---

### Task 2: Offline engine files (one-time fetch, checksum-verified)

**Files:**
- Create: `scripts/fetch-pyodide.mjs`
- Modify: `.gitignore`
- Generated: `apps/desktop/public/pyodide/`

- [x] **Step 1: Ignore the output.** Append to `.gitignore`:

```
# Practice lab engine (Pyodide + wheels, ~150 MB) — fetched by scripts/fetch-pyodide.mjs, never committed
apps/desktop/public/pyodide/
```

- [x] **Step 2: Create `scripts/fetch-pyodide.mjs`:**

```js
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
```

- [x] **Step 3: Run it.** `node scripts/fetch-pyodide.mjs`. Expected:
  - `ok` for 5 core files, 17 packages (`contourpy cycler fonttools joblib kiwisolver matplotlib numpy packaging pandas pillow pyparsing python-dateutil pytz scikit-learn scipy six threadpoolctl`) and seaborn;
  - then `Done: …`.

  **Any `CHECKSUM MISMATCH` → stop and tell the user. Don't change hashes.**

  Check the total size: `du -sh apps/desktop/public/pyodide` (expect roughly 100–160 MB). Check that `git status` doesn't list it.

---

### Task 3: Result comparison (pure) + tests

**Files:**
- Create: `apps/desktop/src/practice/check.ts`
- Test: `apps/desktop/src/practice/check.test.ts`
- Make sure `apps/desktop/tsconfig.json` has `"exclude": ["src/**/*.test.ts"],` after `"include": ["src"],` (the Reading plan adds it; add it if missing).

**Interfaces:**
- Produces:
  - `export interface TableData { columns: string[]; rows: unknown[][]; total: number }`
  - `export type CheckOutcome = { ok: true } | { ok: false; message: string }`
  - `export function compareResults(user: TableData, expected: TableData, ordered: boolean): CheckOutcome`

- [x] **Step 1: Write the failing test** — `apps/desktop/src/practice/check.test.ts`:

```ts
// Run from packages/core:  npx vitest run --root ../../apps/desktop/src/practice --globals
import { compareResults, type TableData } from "./check.ts";

const t = (columns: string[], rows: unknown[][]): TableData => ({ columns, rows, total: rows.length });

describe("compareResults", () => {
  it("passes identical results", () => {
    expect(compareResults(t(["a"], [[1], [2]]), t(["a"], [[1], [2]]), false)).toEqual({ ok: true });
  });
  it("ignores row order unless ordered", () => {
    expect(compareResults(t(["a"], [[2], [1]]), t(["a"], [[1], [2]]), false)).toEqual({ ok: true });
    const r = compareResults(t(["a"], [[2], [1]]), t(["a"], [[1], [2]]), true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Row 1/);
  });
  it("ignores column names (aliases differ) but not column count", () => {
    expect(compareResults(t(["total"], [[5]]), t(["count(*)"], [[5]]), false)).toEqual({ ok: true });
    const r = compareResults(t(["a", "b"], [[1, 2]]), t(["a"], [[1]]), false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/1 column/);
  });
  it("tolerates float noise and 1 vs 1.0", () => {
    expect(compareResults(t(["x"], [[0.1 + 0.2], [3]]), t(["x"], [[0.3], [3.0]]), false)).toEqual({ ok: true });
  });
  it("treats NULL as a value", () => {
    expect(compareResults(t(["x"], [[null]]), t(["x"], [[null]]), false)).toEqual({ ok: true });
    expect(compareResults(t(["x"], [[null]]), t(["x"], [[""]]), false).ok).toBe(false);
  });
  it("reports row count and a missing/extra example", () => {
    const r = compareResults(t(["a"], [[1], [9]]), t(["a"], [[1], [2], [3]]), false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/3 rows/);
      expect(r.message).toMatch(/2 rows/);
    }
    const r2 = compareResults(t(["a"], [[1], [9]]), t(["a"], [[1], [2]]), false);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.message).toMatch(/Missing.*2/);
      expect(r2.message).toMatch(/Unexpected.*9/);
    }
  });
});
```

- [x] **Step 2: Run it to make sure it fails.** From `packages/core`: `npx vitest run --root ../../apps/desktop/src/practice --globals`. Expected: FAIL on `./check.ts`.

- [x] **Step 3: Implement** — `apps/desktop/src/practice/check.ts`:

```ts
// Compares a learner's SQL result with the reference result. Pure; no
// imports (unit-tested in check.test.ts). Deliberately forgiving about
// column NAMES (aliases like count(*) vs total are fine) but strict about
// column count, values and — only when the exercise asks — row order.

export interface TableData {
  columns: string[];
  rows: unknown[][];
  total: number;
}

export type CheckOutcome = { ok: true } | { ok: false; message: string };

function cell(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(Math.round(v * 1e6) / 1e6);
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}

const rowKey = (row: unknown[]) => row.map(cell).join(" | ");
const show = (row: unknown[]) => `(${row.map(cell).join(", ")})`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function compareResults(user: TableData, expected: TableData, ordered: boolean): CheckOutcome {
  if (user.columns.length !== expected.columns.length) {
    return {
      ok: false,
      message: `Expected ${plural(expected.columns.length, "column")}, your query returned ${plural(user.columns.length, "column")}.`,
    };
  }
  if (ordered) {
    const n = Math.max(user.rows.length, expected.rows.length);
    for (let i = 0; i < n; i++) {
      const u = user.rows[i];
      const e = expected.rows[i];
      if (!u || !e || rowKey(u) !== rowKey(e)) {
        if (user.rows.length !== expected.rows.length) {
          return { ok: false, message: `Expected ${plural(expected.rows.length, "row")}, your query returned ${plural(user.rows.length, "row")}.` };
        }
        return { ok: false, message: `Row ${i + 1} differs (order matters here): expected ${show(e!)}, got ${show(u!)}.` };
      }
    }
    return { ok: true };
  }
  const counts = new Map<string, number>();
  for (const r of expected.rows) counts.set(rowKey(r), (counts.get(rowKey(r)) ?? 0) + 1);
  const extra: unknown[][] = [];
  for (const r of user.rows) {
    const k = rowKey(r);
    const c = counts.get(k) ?? 0;
    if (c > 0) counts.set(k, c - 1);
    else extra.push(r);
  }
  const missing = expected.rows.filter((r) => {
    const k = rowKey(r);
    const c = counts.get(k) ?? 0;
    if (c > 0) {
      counts.set(k, c - 1);
      return true;
    }
    return false;
  });
  if (missing.length === 0 && extra.length === 0) return { ok: true };
  const parts = [`Expected ${plural(expected.rows.length, "row")}, your query returned ${plural(user.rows.length, "row")}.`];
  if (missing.length) parts.push(`Missing, e.g. ${show(missing[0]!)}.`);
  if (extra.length) parts.push(`Unexpected, e.g. ${show(extra[0]!)}.`);
  return { ok: false, message: parts.join(" ") };
}
```

- [x] **Step 4: Run the tests and make sure they pass.** Same command. Expected: 6 passed.

---

### Task 4: Engine — protocol, Python harness, worker, client

**Files:**
- Create: `apps/desktop/src/practice/engine/protocol.ts`, `harness.py.ts`, `worker.ts`, `client.ts`

**Interfaces:**
- Consumes: `TableData` from `../check`.
- Produces:
  - `engine` singleton with `start(): Promise<void>`, `run(mode: "sql"|"python", code: string, tests?: string): Promise<RunResult>`, `sqlCheck(code: string, reference: string): Promise<SqlCheckResult>`, `datasets(): Promise<DatasetInfo[]>`, `resetData(): Promise<void>`, `diagnostics(): Promise<{ resources: string[]; tauri: string }>`, `stop(): void`, and `onStatus(fn: (s: EngineStatus) => void): () => void`.
  - `EngineStatus = "idle" | "starting" | "ready" | "busy" | "error"`.

- [x] **Step 1: `apps/desktop/src/practice/engine/protocol.ts`:**

```ts
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
```

- [x] **Step 2: `apps/desktop/src/practice/engine/harness.py.ts`.** This is the Python run inside Pyodide at start-up:

```ts
// Python helpers loaded into Pyodide once per engine start. Names start
// with _aos_ so they don't collide with learner code; `conn` and `load`
// are the two helpers learners use.
export const HARNESS = String.raw`
import sqlite3, csv, io, json, base64, os, sys
os.environ["MPLBACKEND"] = "AGG"

_aos_conn = None
_aos_pristine = None
_aos_tables = []
_aos_manifest = None

def _aos_conv(kind):
    def f(v):
        if v == "":
            return None
        if kind == "INTEGER":
            return int(v)
        if kind == "REAL":
            return float(v)
        return v
    return f

def _aos_seed(manifest_json):
    global _aos_conn, _aos_pristine, _aos_tables, _aos_manifest
    manifest = json.loads(manifest_json)
    base = sqlite3.connect(":memory:")
    for t in manifest["tables"]:
        cols = t["columns"]
        base.execute("CREATE TABLE " + t["name"] + " (" + ", ".join(c["name"] + " " + c["type"] for c in cols) + ")")
        conv = [_aos_conv(c["type"]) for c in cols]
        with open("/data/" + t["file"], newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader)
            rows = [tuple(fn(v) for fn, v in zip(conv, r)) for r in reader]
        base.executemany("INSERT INTO " + t["name"] + " VALUES (" + ",".join("?" * len(cols)) + ")", rows)
    base.commit()
    _aos_pristine = base
    _aos_manifest = manifest
    _aos_tables = [t["name"] for t in manifest["tables"]]
    _aos_reset()

def _aos_reset():
    global _aos_conn
    fresh = sqlite3.connect(":memory:")
    _aos_pristine.backup(fresh)
    _aos_conn = fresh

def _aos_copy():
    c = sqlite3.connect(":memory:")
    _aos_pristine.backup(c)
    return c

def load(name):
    """Return a dataset as a pandas DataFrame, e.g. load("orders")."""
    if name not in _aos_tables:
        raise ValueError("Unknown dataset " + repr(name) + ". Available: " + ", ".join(_aos_tables))
    import pandas as pd
    return pd.read_sql_query("SELECT * FROM " + name, _aos_conn)

def _aos_sql(query, conn=None, limit=None):
    conn = conn or _aos_conn
    cur = conn.cursor()
    last = None
    buf = ""
    def run(stmt):
        nonlocal last
        stmt = stmt.strip()
        if stmt.strip(";").strip():
            cur.execute(stmt)
            if cur.description:
                last = ([d[0] for d in cur.description], cur.fetchall())
    for line in query.splitlines(keepends=True):
        buf += line
        if sqlite3.complete_statement(buf):
            run(buf)
            buf = ""
    if buf.strip():
        run(buf)
    conn.commit()
    if last is None:
        return {"columns": [], "rows": [], "total": 0}
    cols, rows = last
    total = len(rows)
    if limit is not None:
        rows = rows[:limit]
    return {"columns": cols, "rows": [list(r) for r in rows], "total": total}

def _aos_run_sql(query):
    return json.dumps(_aos_sql(query, limit=200), default=str)

def _aos_sql_check(user_query, reference_query):
    expected = _aos_sql(reference_query, _aos_copy())
    user = _aos_sql(user_query, _aos_copy())
    return json.dumps({"user": user, "expected": expected}, default=str)

def _aos_describe(value):
    if value is None:
        return None, None
    pd = sys.modules.get("pandas")
    if pd is not None:
        try:
            if isinstance(value, pd.Series):
                value = value.to_frame()
            if isinstance(value, pd.DataFrame):
                df = value if isinstance(value.index, pd.RangeIndex) else value.reset_index()
                head = df.head(200).astype(object)
                head = head.where(head.notna(), None)
                return {"columns": [str(c) for c in head.columns], "rows": head.values.tolist(), "total": int(len(df))}, None
        except Exception:
            pass
    return None, repr(value)

def _aos_figures():
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return []
    out = []
    for num in plt.get_fignums():
        fig = plt.figure(num)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
        out.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())
    plt.close("all")
    return out

async def _aos_run_py(code, tests):
    from pyodide.code import eval_code_async
    ns = {"__name__": "__main__", "conn": _aos_conn, "load": load}
    try:
        value = await eval_code_async(code, ns, return_mode="last_expr")
        table, text = _aos_describe(value)
        test = None
        if tests:
            try:
                await eval_code_async(tests, ns)
                test = {"passed": True}
            except AssertionError as e:
                test = {"passed": False, "message": str(e) or "One of the checks failed."}
            except Exception as e:
                test = {"passed": False, "message": type(e).__name__ + ": " + str(e)}
        return json.dumps({"table": table, "value": text, "images": _aos_figures(), "test": test}, default=str)
    finally:
        plt = sys.modules.get("matplotlib.pyplot")
        if plt is not None:
            plt.close("all")

def _aos_datasets():
    out = []
    for t in _aos_manifest["tables"]:
        out.append({"name": t["name"], "description": t["description"], "columns": t["columns"],
                    "sample": _aos_sql("SELECT * FROM " + t["name"] + " LIMIT 5", _aos_copy())})
    return json.dumps(out, default=str)
`;
```

- [x] **Step 3: `apps/desktop/src/practice/engine/worker.ts`:**

```ts
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
    await p.loadPackage(SEABORN_WHEEL);
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
```

- [x] **Step 4: `apps/desktop/src/practice/engine/client.ts`:**

```ts
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
```

- [x] **Step 5: Build workers as ES modules.** In `apps/desktop/vite.config.ts`, add `worker: { format: "es" },` directly after `plugins: [react()],`. Vite's default worker format is `iife`, which doesn't match `new Worker(…, { type: "module" })` and the worker's `import()`.

- [x] **Step 6: Typecheck.** Run `cd apps/desktop; npx tsc --noEmit`. Fix only type-level issues and keep behaviour the same. If `import { HARNESS } from "./harness.py.ts"` is rejected, drop the `.ts` extension. `allowImportingTsExtensions` is on, so it should be fine.

---

### Task 5: CSP, progress table, lesson types and content

**Files:**
- Modify: `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src/practice/store.ts`, `apps/desktop/src/practice/content/types.ts`, `apps/desktop/src/practice/content/index.ts`, `apps/desktop/src/practice/content/sql/*.ts`, `apps/desktop/src/practice/content/python/*.ts`

- [x] **Step 1: CSP.** In `tauri.conf.json`, the `"csp"` string currently begins with `"default-src 'self'; connect-src …`. Insert `script-src 'self' 'wasm-unsafe-eval'; ` right after `default-src 'self'; `. Change nothing else. Confirm with `git diff apps/desktop/src-tauri/tauri.conf.json`: exactly that insertion.

- [x] **Step 2: Migration 10.** In `lib.rs`, the migrations vec ends with the `version: 9` (`gd_prep_local`) entry and `}]`. Change that final `    }]` to:

```rust
    }, Migration {
        // Practice lab progress (docs/superpowers/specs/2026-09-28-practice-lab-design.md).
        // Local-only (not in SYNC_TABLES) — covered by the daily backup.
        version: 10,
        description: "practice_progress_local",
        kind: MigrationKind::Up,
        sql: "
            CREATE TABLE practice_progress_local (
                item_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                last_code TEXT,
                updated_at TEXT NOT NULL
            );
        ",
    }]
```

  **If the Reliability or Interviewer plan already added a version 10**, use the next free number and note it in CLAUDE.md. Versions must be unique and increasing. Never edit an existing one.

- [x] **Step 3: `apps/desktop/src/practice/store.ts`:**

```ts
import type { SqliteLocalDb } from "../lib/sqlite-local-db";

export type ItemStatus = "seen" | "passed";
export interface ItemProgress {
  status: ItemStatus;
  lastCode: string | null;
}

export async function loadProgress(db: SqliteLocalDb): Promise<Map<string, ItemProgress>> {
  const rows = await db.raw.select<{ item_id: string; status: ItemStatus; last_code: string | null }[]>(
    "SELECT item_id, status, last_code FROM practice_progress_local"
  );
  return new Map(rows.map((r) => [r.item_id, { status: r.status, lastCode: r.last_code }]));
}

/** Saves the learner's latest code; never downgrades "passed" to "seen". */
export async function saveCode(db: SqliteLocalDb, itemId: string, code: string): Promise<void> {
  await db.raw.execute(
    `INSERT INTO practice_progress_local (item_id, status, last_code, updated_at) VALUES ($1, 'seen', $2, $3)
     ON CONFLICT(item_id) DO UPDATE SET last_code = excluded.last_code, updated_at = excluded.updated_at`,
    [itemId, code, new Date().toISOString()]
  );
}

export async function markPassed(db: SqliteLocalDb, itemId: string, code: string): Promise<void> {
  await db.raw.execute(
    `INSERT INTO practice_progress_local (item_id, status, last_code, updated_at) VALUES ($1, 'passed', $2, $3)
     ON CONFLICT(item_id) DO UPDATE SET status = 'passed', last_code = excluded.last_code, updated_at = excluded.updated_at`,
    [itemId, code, new Date().toISOString()]
  );
}
```

- [x] **Step 4: `apps/desktop/src/practice/content/types.ts`:**

```ts
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
```

- [x] **Step 5: Write the first SQL lesson exactly as below** — `apps/desktop/src/practice/content/sql/01-select.ts`:

```ts
import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-01",
  track: "sql",
  title: "SELECT — reading columns from a table",
  body: `A database stores data in tables: rows are records, columns are fields. \`SELECT\` is how you ask for data.

The shape is always \`SELECT columns FROM table\`. Use \`*\` for every column, or list the ones you need separated by commas.

- \`SELECT * FROM products\` returns every column of every product.
- \`SELECT product_name, unit_price FROM products\` returns just two columns.
- \`AS\` renames a column in the result: \`SELECT unit_price AS price FROM products\`.
- \`DISTINCT\` removes duplicate rows: \`SELECT DISTINCT category FROM products\`.

In interviews, list columns explicitly rather than using \`*\` — it shows you know what you need, and it's faster on big tables.`,
  example: `SELECT product_name, category, unit_price
FROM products
LIMIT 10;`,
  exercises: [
    {
      id: "sql-01-e1",
      prompt: "List the full_name and city of every customer.",
      starter: "SELECT \nFROM customers;",
      solution: "SELECT full_name, city FROM customers;",
      hint: "Put the two column names after SELECT, separated by a comma.",
    },
    {
      id: "sql-01-e2",
      prompt: "Show each distinct product category once.",
      starter: "",
      solution: "SELECT DISTINCT category FROM products;",
      hint: "DISTINCT goes right after SELECT.",
    },
    {
      id: "sql-01-e3",
      prompt: "Show product_name and unit_price, but name the second column price.",
      starter: "",
      solution: "SELECT product_name, unit_price AS price FROM products;",
    },
  ],
};
```

- [x] **Step 6: Write the first Python lesson exactly as below** — `apps/desktop/src/practice/content/python/01-basics.ts`:

```ts
import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-01",
  track: "python",
  title: "Python basics — values, variables and print",
  body: `Python runs top to bottom. A variable is a name for a value: \`price = 499\`.

- Numbers: \`499\`, \`12.5\`. Text (strings): \`"Bengaluru"\`. True/False: \`True\`.
- \`print(...)\` shows something in the output.
- f-strings put values inside text: \`f"Total: {qty * price}"\`.
- The last line of a cell, if it's a value, is shown automatically — just like a notebook.

Try changing the numbers in the example and run it again (Ctrl+Enter).`,
  example: `price = 499
qty = 3
total = price * qty
print(f"{qty} items at ₹{price} = ₹{total}")
total`,
  exercises: [
    {
      id: "py-01-e1",
      prompt: "Create a variable `gst` equal to 18% of 1,250 (use 0.18).",
      starter: "gst = ",
      solution: "gst = 1250 * 0.18",
      tests: `assert "gst" in dir(), "Create a variable called gst."
assert abs(gst - 225) < 1e-9, f"gst should be 225, got {gst}"`,
    },
    {
      id: "py-01-e2",
      prompt: "Make `greeting` equal to the text Hello, Bengaluru! using an f-string and the variable city.",
      starter: 'city = "Bengaluru"\ngreeting = ',
      solution: 'city = "Bengaluru"\ngreeting = f"Hello, {city}!"',
      tests: `assert greeting == "Hello, Bengaluru!", f"got {greeting!r}"`,
    },
  ],
};
```

- [x] **Step 7: Write the remaining lessons** in the same format: one file per lesson, ids and filenames as listed. Every lesson needs:
  - a `body` of 120–250 words: original, plain English, examples using the Bharat Retail tables;
  - a runnable `example`;
  - the listed exercises, each with `solution` and (for Python) `tests` with helpful assert messages.

  **Before moving on, run every exercise's solution through the engine (Task 8, Step 5) and confirm it passes.**

  **SQL** (`content/sql/`), exercises in brackets:
  - `02-where.ts` "WHERE — filtering rows": `=`, `<>`, `>`/`<`, `AND`/`OR`, `IN`, `BETWEEN`, `LIKE`. [customers in Karnataka; products priced 500–2000; orders paid by UPI or Card]
  - `03-order-limit.ts` "ORDER BY and LIMIT". [5 most expensive products (`ordered: true`); newest 10 orders (`ordered: true`)]
  - `04-aggregates.ts` "COUNT, SUM, AVG, MIN, MAX". [number of orders; average product price rounded to 2 dp; highest salary]
  - `05-group-by.ts` "GROUP BY and HAVING". [orders per status; average salary per department; categories with more than 8 products]
  - `06-joins.ts` "INNER JOIN and LEFT JOIN". [order_id with customer full_name; every customer with their order count including zero (LEFT JOIN)]
  - `07-multi-join.ts` "Joining three or more tables". [revenue per category = SUM(quantity*unit_price*(1-discount)) from delivered orders; region_name per order]
  - `08-subqueries.ts` "Subqueries". [products priced above the average; customers who never ordered (NOT IN / NOT EXISTS)]
  - `09-cte.ts` "WITH (CTEs)". [top category per region using a CTE of revenue; customers whose spend is above the average customer spend]
  - `10-case.ts` "CASE WHEN". [label products Budget/Mid/Premium by price; count orders per label]
  - `11-strings-dates.ts` "Text and date functions": `TRIM`, `LOWER`, `SUBSTR`, `strftime`. [clean full_name with TRIM + proper-case check; orders per year-month using `strftime('%Y-%m', order_date)`]
  - `12-window.ts` "Window functions": `ROW_NUMBER`, `RANK`, `LAG`, running `SUM`. [rank employees by salary within department; month-over-month revenue change from monthly_sales]
  - `13-nulls.ts` "NULLs". [customers with no city; `COALESCE(payment_method,'Unknown')` counts]
  - `14-interview-patterns.ts` "Interview patterns". [second-highest salary; top 3 products per category by revenue; repeat-customer rate (customers with ≥2 orders ÷ customers with ≥1)]

  **Python** (`content/python/`):
  - `02-lists-dicts.ts` "Lists and dictionaries". [list comprehension of GST-inclusive prices; dict of city → count]
  - `03-loops-conditions.ts` "Loops and if". [FizzBuzz-style discount tiers; sum of even numbers]
  - `04-functions.ts` "Functions". [`net_price(price, discount)`; `grade(score)` → A/B/C]
  - `05-comprehensions.ts` "Comprehensions and sorting". [sorted by key; dict comprehension]
  - `06-errors.ts` "Errors and try/except". [`safe_div`; parse ints from messy strings]
  - `07-pandas-intro.ts` "pandas: load and inspect" (`load("orders")`, `head`, `shape`, `dtypes`, `describe`). [variable `n_rows`; `statuses` = sorted unique statuses]
  - `08-pandas-filter.ts` "Filtering and selecting". [delivered UPI orders; products in two categories]
  - `09-pandas-groupby.ts` "groupby and agg". [revenue by category DataFrame; avg salary by dept]
  - `10-pandas-merge.ts` "merge (joins)". [orders + customers; items + products revenue]
  - `11-pandas-pivot.ts` "pivot_table and crosstab". [region × category revenue pivot]
  - `12-pandas-dates.ts` "Dates". [`to_datetime`; monthly order counts; busiest month]
  - `13-pandas-cleaning.ts` "Cleaning data". [strip/title-case names; fill missing city with "Unknown"; drop duplicates]
  - `14-matplotlib.ts` "Charts with matplotlib". [bar chart of revenue by category. Tests check `plt.gcf().axes` has a title. The figure is captured automatically]
  - `15-seaborn.ts` "Charts with seaborn". [`sns.barplot` / `sns.histplot`; tests assert the axes exist]
  - `16-sklearn-regression.ts` "scikit-learn: linear regression" (`load_diabetes`, `train_test_split`, `LinearRegression`, R²). [`r2` > 0.3]
  - `17-sklearn-classification.ts` "Classification + accuracy" (`load_iris`, `LogisticRegression(max_iter=500)`, accuracy). [`acc` > 0.85]
  - `18-scipy-stats.ts` "Statistics with scipy" (`ttest_ind`, `pearsonr`). [t-test between two regions' order values; correlation of price vs quantity]

- [x] **Step 8: `apps/desktop/src/practice/content/index.ts`:**

```ts
import type { Lesson, Track } from "./types";

const modules = import.meta.glob<{ lesson: Lesson }>("./{sql,python}/*.ts", { eager: true });

export const LESSONS: Lesson[] = Object.keys(modules)
  .sort()
  .map((k) => modules[k]!.lesson);

export const lessonsFor = (track: Track) => LESSONS.filter((l) => l.track === track);
```

  `import.meta.glob` is built into Vite. It needs the `vite/client` types; `src/vite-env.d.ts` already references them. If `tsc` complains, check that file contains `/// <reference types="vite/client" />`.

- [x] **Step 9: Typecheck.** Run `cd apps/desktop; npx tsc --noEmit`. Expected: no errors.

---

### Task 6: Practice UI

**Files:**
- Create: `apps/desktop/src/components/practice/CodeEditor.tsx`, `ResultView.tsx`, `LessonText.tsx`, `ExerciseCard.tsx`, `DatasetsPanel.tsx`
- Create: `apps/desktop/src/components/PracticeView.tsx`
- Modify: `apps/desktop/src/App.tsx`, `apps/desktop/src/App.css`

- [x] **Step 1: `components/practice/CodeEditor.tsx`:**

```tsx
interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  rows?: number;
  label: string;
}

/** Plain textarea editor: Tab inserts 4 spaces, Ctrl+Enter runs. No editor dependency. */
export function CodeEditor({ value, onChange, onRun, rows = 8, label }: CodeEditorProps) {
  return (
    <textarea
      className="practice-editor"
      aria-label={label}
      spellCheck={false}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.ctrlKey) {
          e.preventDefault();
          onRun();
        } else if (e.key === "Tab" && !e.shiftKey) {
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart: s, selectionEnd: end } = el;
          const next = value.slice(0, s) + "    " + value.slice(end);
          onChange(next);
          requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
        }
      }}
    />
  );
}
```

- [x] **Step 2: `components/practice/ResultView.tsx`:**

```tsx
import type { RunResult } from "../../practice/engine/protocol";
import type { TableData } from "../../practice/check";

export function DataTable({ table }: { table: TableData }) {
  if (table.columns.length === 0) return <p className="practice-result__note">Done — no rows returned.</p>;
  return (
    <div className="practice-table-wrap">
      <table className="practice-table">
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={v === null ? "is-null" : undefined}>
                  {v === null ? "NULL" : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.total > table.rows.length && (
        <p className="practice-result__note">
          Showing {table.rows.length} of {table.total} rows.
        </p>
      )}
    </div>
  );
}

export function ResultView({ result }: { result: RunResult }) {
  return (
    <div className="practice-result">
      {result.error && <pre className="practice-result__error">{result.error}</pre>}
      {result.stdout && <pre className="practice-result__out">{result.stdout}</pre>}
      {result.stderr && <pre className="practice-result__err">{result.stderr}</pre>}
      {result.table && <DataTable table={result.table} />}
      {result.value && <pre className="practice-result__out">{result.value}</pre>}
      {result.images.map((src, i) => (
        <img key={i} className="practice-result__chart" src={src} alt={`Chart ${i + 1}`} />
      ))}
    </div>
  );
}
```

- [x] **Step 3: `components/practice/LessonText.tsx`** renders the plain-text lesson format safely:

```tsx
import { Fragment } from "react";

function inline(text: string) {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 1 ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>
  );
}

/** Blank line = paragraph, "- " = bullet, `x` = inline code. Plain React text only. */
export function LessonText({ text }: { text: string }) {
  return (
    <div className="lesson-text">
      {text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.trim().startsWith("- "))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.trim().slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(block)}</p>;
      })}
    </div>
  );
}
```

- [x] **Step 4: `components/practice/ExerciseCard.tsx`:**

```tsx
import { useState } from "react";
import { Check, Lightbulb, Play, Eye } from "lucide-react";
import type { Exercise, Track } from "../../practice/content/types";
import type { RunResult } from "../../practice/engine/protocol";
import { engine } from "../../practice/engine/client";
import { compareResults } from "../../practice/check";
import { CodeEditor } from "./CodeEditor";
import { ResultView } from "./ResultView";

interface ExerciseCardProps {
  exercise: Exercise;
  track: Track;
  index: number;
  passed: boolean;
  savedCode: string | null;
  onSaveCode: (code: string) => void;
  onPassed: (code: string) => void;
}

export function ExerciseCard({ exercise, track, index, passed, savedCode, onSaveCode, onPassed }: ExerciseCardProps) {
  const [code, setCode] = useState(savedCode ?? exercise.starter);
  const [result, setResult] = useState<RunResult | null>(null);
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    onSaveCode(code);
    try {
      setResult(await engine.run(track, code));
    } catch (err) {
      setResult({ ok: false, stdout: "", stderr: "", error: err instanceof Error ? err.message : String(err), images: [] });
    } finally {
      setRunning(false);
    }
  }

  async function check() {
    setRunning(true);
    setAttempted(true);
    onSaveCode(code);
    try {
      if (track === "sql") {
        const r = await engine.sqlCheck(code, exercise.solution);
        if (!r.user || !r.expected) {
          setVerdict({ ok: false, message: r.error ?? "Your query didn't run." });
        } else {
          const outcome = compareResults(r.user, r.expected, exercise.ordered === true);
          setVerdict(outcome.ok ? { ok: true, message: "Correct!" } : { ok: false, message: outcome.message });
          if (outcome.ok) onPassed(code);
        }
      } else {
        const r = await engine.run("python", code, exercise.tests);
        setResult(r);
        const ok = r.test?.passed === true;
        setVerdict(ok ? { ok: true, message: "Correct!" } : { ok: false, message: r.test?.message ?? r.error ?? "Not quite." });
        if (ok) onPassed(code);
      }
    } catch (err) {
      setVerdict({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className={`exercise ${passed ? "exercise--passed" : ""}`}>
      <h4 className="exercise__title">
        Exercise {index + 1} {passed && <Check size={14} strokeWidth={2.5} />}
      </h4>
      <p className="exercise__prompt">{exercise.prompt}</p>
      <CodeEditor value={code} onChange={setCode} onRun={() => void run()} label={`Exercise ${index + 1} code`} />
      <div className="exercise__actions">
        <button className="btn btn--secondary btn--sm" disabled={running} onClick={() => void run()}>
          <Play size={13} strokeWidth={2} /> Run
        </button>
        <button className="btn btn--primary btn--sm" disabled={running} onClick={() => void check()}>
          <Check size={13} strokeWidth={2} /> Check
        </button>
        {exercise.hint && (
          <button className="btn btn--ghost btn--sm" onClick={() => setShowHint((v) => !v)}>
            <Lightbulb size={13} strokeWidth={2} /> Hint
          </button>
        )}
        {attempted && (
          <button className="btn btn--ghost btn--sm" onClick={() => setShowSolution((v) => !v)}>
            <Eye size={13} strokeWidth={2} /> {showSolution ? "Hide solution" : "Show solution"}
          </button>
        )}
      </div>
      {showHint && exercise.hint && <p className="exercise__hint">{exercise.hint}</p>}
      {verdict && <p className={`exercise__verdict ${verdict.ok ? "is-ok" : "is-bad"}`}>{verdict.message}</p>}
      {showSolution && <pre className="exercise__solution">{exercise.solution}</pre>}
      {result && <ResultView result={result} />}
    </section>
  );
}
```

- [x] **Step 5: `components/practice/DatasetsPanel.tsx`:**

```tsx
import { useEffect, useState } from "react";
import type { DatasetInfo } from "../../practice/engine/protocol";
import { engine } from "../../practice/engine/client";
import { DataTable } from "./ResultView";

export function DatasetsPanel() {
  const [data, setData] = useState<DatasetInfo[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    engine.datasets().then(setData, (e: Error) => setError(e.message));
  }, []);
  if (error) return <p className="practice-result__error">{error}</p>;
  if (!data) return <p className="practice-muted">Loading datasets…</p>;
  return (
    <div className="datasets">
      <p className="practice-muted">
        Bharat Retail is an invented Indian e-commerce company — all data is synthetic. In SQL, query the tables by name. In Python, use <code>load("orders")</code> to get a pandas DataFrame, or <code>conn</code> for raw SQL. scikit-learn's own datasets (<code>load_iris</code>, <code>load_wine</code>, <code>load_diabetes</code>, <code>load_breast_cancer</code>) also work offline.
      </p>
      {data.map((d) => (
        <section key={d.name} className="dataset">
          <h3>{d.name}</h3>
          <p className="practice-muted">{d.description}</p>
          <p className="dataset__cols">{d.columns.map((c) => `${c.name} (${c.type.toLowerCase()})`).join(" · ")}</p>
          <DataTable table={d.sample} />
        </section>
      ))}
    </div>
  );
}
```

- [x] **Step 6: `components/PracticeView.tsx`:**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Play, RotateCcw, Square } from "lucide-react";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { engine, type EngineStatus } from "../practice/engine/client";
import type { RunResult } from "../practice/engine/protocol";
import { lessonsFor } from "../practice/content";
import type { Lesson, Track } from "../practice/content/types";
import { loadProgress, markPassed, saveCode, type ItemProgress } from "../practice/store";
import { CodeEditor } from "./practice/CodeEditor";
import { ResultView } from "./practice/ResultView";
import { LessonText } from "./practice/LessonText";
import { ExerciseCard } from "./practice/ExerciseCard";
import { DatasetsPanel } from "./practice/DatasetsPanel";

const STATUS_TEXT: Record<EngineStatus, string> = {
  idle: "Stopped",
  starting: "Starting Python… (first time takes a few seconds)",
  ready: "Ready",
  busy: "Running…",
  error: "Engine error",
};

export function PracticeView({ localDb }: { localDb: SqliteLocalDb }) {
  const [track, setTrack] = useState<Track>("sql");
  const [lessonId, setLessonId] = useState<string | "datasets">(() => lessonsFor("sql")[0]?.id ?? "datasets");
  const [status, setStatus] = useState<EngineStatus>(engine.status);
  const [progress, setProgress] = useState<Map<string, ItemProgress>>(new Map());
  const [exampleCode, setExampleCode] = useState("");
  const [exampleResult, setExampleResult] = useState<RunResult | null>(null);
  const diagClicks = useRef(0);

  const lessons = useMemo(() => lessonsFor(track), [track]);
  const lesson: Lesson | undefined = lessons.find((l) => l.id === lessonId);

  useEffect(() => engine.onStatus(setStatus), []);
  useEffect(() => {
    void engine.start().catch(() => {});
    void loadProgress(localDb).then(setProgress);
  }, [localDb]);
  useEffect(() => {
    setExampleCode(lesson?.example ?? "");
    setExampleResult(null);
  }, [lesson]);

  const refresh = () => void loadProgress(localDb).then(setProgress);
  const done = (l: Lesson) => l.exercises.filter((e) => progress.get(e.id)?.status === "passed").length;

  async function runExample() {
    if (!lesson) return;
    try {
      setExampleResult(await engine.run(lesson.track, exampleCode));
    } catch (err) {
      setExampleResult({ ok: false, stdout: "", stderr: "", error: err instanceof Error ? err.message : String(err), images: [] });
    }
  }

  return (
    <div className="practice">
      <aside className="practice__nav">
        <div className="practice__tracks">
          {(["sql", "python"] as const).map((t) => (
            <button
              key={t}
              className={`news-view__subtab ${track === t ? "news-view__subtab--active" : ""}`}
              onClick={() => {
                setTrack(t);
                setLessonId(lessonsFor(t)[0]?.id ?? "datasets");
              }}
            >
              {t === "sql" ? "SQL" : "Python"}
            </button>
          ))}
        </div>
        <ol className="practice__lessons">
          {lessons.map((l) => (
            <li key={l.id}>
              <button className={`practice__lesson ${lessonId === l.id ? "is-active" : ""}`} onClick={() => setLessonId(l.id)}>
                <span>{l.title}</span>
                <span className="practice__count">
                  {done(l)}/{l.exercises.length}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <button className={`practice__lesson ${lessonId === "datasets" ? "is-active" : ""}`} onClick={() => setLessonId("datasets")}>
          <span>
            <Database size={13} strokeWidth={2} /> Datasets
          </span>
        </button>
      </aside>

      <section className="practice__main">
        <header className="practice__bar">
          <span
            className={`practice__status practice__status--${status}`}
            onClick={() => {
              // Hidden support hook: 5 clicks log what the engine loaded and
              // whether it can see Tauri (it must not) — used in verification.
              diagClicks.current += 1;
              if (diagClicks.current === 5) {
                diagClicks.current = 0;
                void engine.diagnostics().then((d) => console.log("practice-diagnostics " + JSON.stringify(d)));
              }
            }}
          >
            {status === "error" ? `${STATUS_TEXT.error}: ${engine.lastError}` : STATUS_TEXT[status]}
          </span>
          <button className="btn btn--ghost btn--sm" disabled={status !== "busy"} onClick={() => engine.stop()} title="Stop a long-running run">
            <Square size={13} strokeWidth={2} /> Stop
          </button>
          <button className="btn btn--ghost btn--sm" disabled={status !== "ready"} onClick={() => void engine.resetData()} title="Undo any changes your SQL made to the tables">
            <RotateCcw size={13} strokeWidth={2} /> Reset data
          </button>
        </header>

        {lessonId === "datasets" || !lesson ? (
          <DatasetsPanel />
        ) : (
          <article className="lesson">
            <h2>{lesson.title}</h2>
            <LessonText text={lesson.body} />
            <h3>Try it</h3>
            <CodeEditor value={exampleCode} onChange={setExampleCode} onRun={() => void runExample()} label="Example code" />
            <div className="exercise__actions">
              <button className="btn btn--primary btn--sm" onClick={() => void runExample()} disabled={status === "busy" || status === "starting"}>
                <Play size={13} strokeWidth={2} /> Run (Ctrl+Enter)
              </button>
            </div>
            {exampleResult && <ResultView result={exampleResult} />}
            {lesson.exercises.map((ex, i) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                track={lesson.track}
                index={i}
                passed={progress.get(ex.id)?.status === "passed"}
                savedCode={progress.get(ex.id)?.lastCode ?? null}
                onSaveCode={(code) => void saveCode(localDb, ex.id, code)}
                onPassed={(code) => void markPassed(localDb, ex.id, code).then(refresh)}
              />
            ))}
          </article>
        )}
      </section>
    </div>
  );
}
```

- [x] **Step 7: Wire it into `App.tsx`.**
  1. Add `import { PracticeView } from "./components/PracticeView";`, and `FlaskConical` to the `lucide-react` import list.
  2. Change the `View` union to append `| "practice"`.
  3. In the nav array, after `{ id: "news", label: "News", Icon: Newspaper },`, add `{ id: "practice", label: "Practice", Icon: FlaskConical },`.
  4. In the view ternary, before the final `) : (` that renders `TimetableView`, add:

```tsx
      ) : view === "practice" ? (
        <main className="app-main app-main--practice">
          <PracticeView localDb={localDb} />
        </main>
```

- [x] **Step 8: Append styles** to `apps/desktop/src/App.css`:

```css
/* ============================================================
   Practice lab
   ============================================================ */
.practice { display: flex; height: 100%; min-height: 0; }
.practice__nav { width: 260px; flex-shrink: 0; overflow-y: auto; padding: var(--space-4) var(--space-3); border-right: 1px solid var(--border); }
.practice__tracks { display: flex; gap: var(--space-2); margin-bottom: var(--space-3); }
.practice__lessons { list-style: none; margin: 0 0 var(--space-3); padding: 0; }
.practice__lesson { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); width: 100%; padding: 6px var(--space-2); border: none; border-radius: var(--radius-sm); background: none; color: var(--ink-secondary); font-size: var(--text-sm); text-align: left; cursor: pointer; }
.practice__lesson span:first-child { display: inline-flex; align-items: center; gap: 6px; }
.practice__lesson:hover { background: var(--surface-2); color: var(--ink); }
.practice__lesson.is-active { background: var(--accent-tint); color: var(--ink); font-weight: 600; }
.practice__count { flex-shrink: 0; font-size: var(--text-xs); color: var(--muted); }
.practice__main { flex: 1; min-width: 0; overflow-y: auto; padding: var(--space-4) var(--space-6) var(--space-8); }
.practice__bar { position: sticky; top: calc(var(--space-4) * -1); z-index: var(--z-sticky); display: flex; align-items: center; gap: var(--space-2); margin: calc(var(--space-4) * -1) calc(var(--space-6) * -1) var(--space-4); padding: var(--space-2) var(--space-6); border-bottom: 1px solid var(--border); background: var(--bg); }
.practice__status { flex: 1; font-size: var(--text-xs); color: var(--muted); }
.practice__status--ready { color: var(--success); }
.practice__status--error { color: var(--danger); }
.practice-muted { color: var(--muted); font-size: var(--text-sm); }
.lesson { max-width: 860px; }
.lesson h2 { margin: 0 0 var(--space-3); font-size: var(--text-xl); }
.lesson h3 { margin: var(--space-5) 0 var(--space-2); font-size: var(--text-md); }
.lesson-text { color: var(--ink); line-height: 1.6; }
.lesson-text code, .datasets code { padding: 0.1em 0.35em; border-radius: var(--radius-sm); background: var(--surface-2); font-size: 0.9em; }
.practice-editor { display: block; width: 100%; padding: var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--surface-2); color: var(--ink); font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 13.5px; line-height: 1.5; resize: vertical; tab-size: 4; }
.practice-editor:focus { outline: none; border-color: var(--accent); }
.exercise { margin-top: var(--space-5); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); }
.exercise--passed { border-color: color-mix(in oklch, var(--success) 50%, transparent); }
.exercise__title { display: flex; align-items: center; gap: 6px; margin: 0 0 var(--space-2); font-size: var(--text-sm); }
.exercise--passed .exercise__title { color: var(--success); }
.exercise__prompt { margin: 0 0 var(--space-3); }
.exercise__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-2) 0; }
.exercise__hint { margin: var(--space-2) 0; color: var(--ink-secondary); font-style: italic; }
.exercise__verdict { margin: var(--space-2) 0; font-weight: 600; }
.exercise__verdict.is-ok { color: var(--success); }
.exercise__verdict.is-bad { color: var(--danger); }
.exercise__solution { padding: var(--space-3); border-radius: var(--radius-md); background: var(--surface-2); white-space: pre-wrap; font-size: 13px; }
.practice-result { margin-top: var(--space-2); }
.practice-result pre { margin: var(--space-2) 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); background: var(--surface-2); white-space: pre-wrap; font-size: 12.5px; }
.practice-result__error, .practice-result__err { color: var(--danger); }
.practice-result__note { color: var(--muted); font-size: var(--text-xs); }
.practice-result__chart { display: block; max-width: 100%; margin: var(--space-2) 0; border-radius: var(--radius-sm); background: #fff; }
.practice-table-wrap { max-height: 360px; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.practice-table { border-collapse: collapse; font-size: 12.5px; }
.practice-table th, .practice-table td { padding: 4px 10px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
.practice-table th { position: sticky; top: 0; background: var(--surface-2); }
.practice-table td.is-null { color: var(--muted-2); font-style: italic; }
.dataset { margin-bottom: var(--space-5); }
.dataset h3 { margin: 0 0 4px; font-family: ui-monospace, Consolas, monospace; }
.dataset__cols { font-size: var(--text-xs); color: var(--ink-secondary); }
```

- [x] **Step 9: Typecheck.** Run `cd apps/desktop; npx tsc --noEmit`. Expected: no errors.

---

### Task 7: Build

- [x] **Step 1:** Make sure `apps/desktop/public/pyodide/` exists (Task 2). Ask the user to quit the app from the tray, then confirm with `Get-Process desktop`.
- [x] **Step 2: Build** (timeout 600000). **Measure the time and the exe size:** `(Get-Item …\target\release\desktop.exe).Length / 1MB`.
  - **If the build takes more than about 10 minutes or the exe is over about 250 MB:** stop and tell the user. The fallback (shipping `public/pyodide` as a Tauri resource through the asset protocol) needs an asset-scope and CSP decision from them.
- [x] **Step 3:** Launch with CDP (as in the other plans).

---

### Task 8: Verify live

Save `cdp.mjs` from the Appendix of `docs/superpowers/plans/2026-09-26-gd-prep.md`.

- [x] **Step 1: Open Practice, then check that the engine starts and is sandboxed.** Save and run `verify-practice.mjs`. It drives the UI; the engine singleton isn't reachable from the console, so these checks use the page.

```js
import { connectMain, sleep } from "./cdp.mjs";
const { ev, logs, close } = await connectMain();
await ev(`Array.from(document.querySelectorAll('button.nav-rail__item')).find(b => b.textContent.includes('Practice')).click()`);
for (let i = 0; i < 60; i++) {
  const s = await ev(`document.querySelector('.practice__status')?.textContent`);
  if (s && !s.startsWith("Starting")) { console.log("status:", s); break; }
  await sleep(1000);
}
// Run the SQL lesson's example.
await ev(`Array.from(document.querySelectorAll('.exercise__actions .btn--primary')).find(b => b.textContent.includes('Run'))?.click()`);
await sleep(3000);
console.log("sql rows shown:", await ev(`document.querySelectorAll('.lesson > .practice-result .practice-table tbody tr').length`));
console.log("console errors:", logs.filter((l) => /csp|refused|eval|wasm/i.test(l)).slice(0, 5));
close(); setTimeout(() => process.exit(0), 200);
```

  **Expected:** status `Ready` within about 30 s, 10 SQL rows, and no CSP errors.
  - **If CSP errors mention `unsafe-eval` or anything else:** stop (Global Constraints).

- [x] **Step 2: Sandbox and offline proof.** The status text has a hidden hook (Task 6 Step 6): 5 clicks log `practice-diagnostics {…}`. With `connectMain()` collecting `logs`, run `for (let i=0;i<5;i++) await ev("document.querySelector('.practice__status').click()")`, wait 2 s, and print the log line.
  - **Expected:** `"tauri":"undefined"`, and every URL in `resources` starts with `http://tauri.localhost/`. That means nothing came from the internet.
  - **If any resource is off-origin, or `tauri` isn't `"undefined"`:** stop and report it.

- [x] **Step 3: Libraries load offline.** In the Python track, in the first lesson's Try-it editor, set the code to:

```python
import pandas, numpy, matplotlib, sklearn, scipy, seaborn, sqlite3
print(pandas.__version__, numpy.__version__, sklearn.__version__, seaborn.__version__)
```

  Run it. This can take 20–60 s the first time as packages load. **Expected:** version numbers print, with no error.

- [x] **Step 4: Stop works.** Run `while True: pass`, click **Stop** within 3 s, then run a trivial `1+1`. **Expected:** the status returns to Stopped → Starting → Ready, and `2` shows.

- [x] **Step 5: Every exercise's solution passes.** For each lesson, paste each exercise's `solution` into its editor and click **Check** (script it with CDP, setting textarea values via the native value setter as in the Reading plan). **All must say "Correct!"**. Fix content, never the checker, when one fails.
- [x] **Step 6: A wrong answer fails helpfully.** For `sql-01-e1`, submit `SELECT full_name FROM customers;`. **Expected:** "Expected 2 columns, your query returned 1 column."
- [x] **Step 7: Charts.** Lesson 14's example renders an `<img class="practice-result__chart">`.
- [x] **Step 8: Ask the user to try it.** One SQL lesson and one Python lesson, in both themes. Wait for their OK.

---

### Task 9: Documentation

- [x] **CLAUDE.md:** add a "Practice lab (built <date>)" bullet covering:
  - Pyodide 314.0.7 in a worker (why a worker: no Tauri IPC);
  - the `public/pyodide/` fetch script and that it's gitignored ("run `node scripts/fetch-pyodide.mjs` before building on a fresh clone");
  - the CSP change and whether `'unsafe-eval'` was needed;
  - the datasets script;
  - migration 10;
  - the test command `npx vitest run --root ../../apps/desktop/src/practice --globals`;
  - the measured exe size and build time.

  **Important for future builds:** `public/pyodide` must exist or the Practice view fails at runtime.
- [x] **Update the spec** `docs/superpowers/specs/2026-09-28-practice-lab-design.md` to reflect the three changes listed at the top of this plan (seaborn from PyPI, Penguins → sklearn bundled datasets, runtime reference images).
- [x] **Memory:** a new `project_practice_lab.md` plus its MEMORY.md pointer.
- [x] **LEARNING.md:** a short "Practice lab" section. Cover WebAssembly, why a Web Worker is a sandbox, and why the engine files aren't in git.
- [ ] **Report to the user.** Nothing is committed.
