# Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, **inline in this session (no subagents)**. Steps use checkbox (`- [ ]`) syntax — tick each one in this file as you finish it.

**Goal:**
- Stop the every-round full re-download: the user applies the pending Supabase migrations.
- Keep 7 daily local backups of the SQLite file.
- Make the app repair itself automatically if the local database is ever corrupt again.

**Architecture:**
- **Backups:** SQLite's own `VACUUM INTO` (run from JS through the existing plugin-sql connection) writes the backup file. A tiny Rust command prepares the folder, prunes old backups and returns the target path.
- **Self-repair:**
  - JS detects corruption: `Database.load` throws, or `PRAGMA quick_check` isn't `ok`.
  - A Rust command writes a `repair-requested` marker and calls `request_restart()`.
  - On the next start, at the very top of `setup()`, before any window can open the DB, Rust moves the damaged files into a dated folder.
  - The plugin then creates a fresh DB and runs every migration, and sync re-pulls everything from Supabase.

**Why a full restart and not `location.reload()`:** `tauri-plugin-sql` 2.4.1 runs migrations only on the **first** `load` in a process (`commands.rs`: `migrations.0.lock().await.remove(&db)`). A reload would reopen a fresh file with **no tables**. Also, on Windows the files can't be renamed while the plugin's pool still has them open.

**Tech Stack:** Tauri 2.11 (Rust, `AppHandle::request_restart`, `app.path().app_config_dir()`), tauri-plugin-sql 2.4.1 (SQLite via sqlx), React/TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-reliability-design.md`. This plan supersedes the spec's "close + move + reload" repair mechanism, for the reason above; everything else is unchanged.

## Global Constraints

- **Read `CLAUDE.md` first.** Its Operational constraints are binding.
- **Free, offline, no new online services.** **No new npm or cargo dependencies.**
- **Never handle the Supabase DB password; never run `supabase db push`.** The user pastes the SQL into Dashboard → SQL Editor themselves.
- **Never write to, move or delete the live SQLite file yourself.** Only the app's own code does that, and only when it is genuinely corrupt. Test file-moving logic on temp directories only.
- **Never kill the app.** Ask the user to quit from the tray, then confirm with `Get-Process desktop -ErrorAction SilentlyContinue`.
- **Build only with** `./node_modules/.bin/tauri.CMD build --no-bundle` (from `apps/desktop`, with `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"`).
- **Don't commit** unless the user asks; exclude `.claude/` and `LEARNING.md`.
- **No full-desktop screenshots.**
- **Plain-language updates** for a non-developer.
- **Exact values:**
  - backups go in `<app_config_dir>/backups/academic-os-YYYY-MM-DD.db`, keeping the newest **7**;
  - damaged files go in `<app_config_dir>/corrupted-backup-YYYY-MM-DD-HHMM/`;
  - the marker file is `<app_config_dir>/repair-requested` and the notice file is `<app_config_dir>/repair-notice.txt`;
  - `app_config_dir` is `%APPDATA%\com.academicos.app`, the same directory tauri-plugin-sql uses (`wrapper.rs` → `app_config_dir()`).

## File map

| File | Status | Responsibility |
|---|---|---|
| `apps/desktop/src-tauri/src/lib.rs` | modify | `prepare_backup`, `request_db_repair`, `take_repair_notice` commands; `perform_pending_repair` in `setup()`; pure helpers + `#[cfg(test)]` tests |
| `apps/desktop/src/lib/db-health-logic.ts` | create | pure: corruption detection, quick_check parsing, date stamps, backup-due |
| `apps/desktop/src/lib/db-health-logic.test.ts` | create | unit tests |
| `apps/desktop/src/lib/db-health.ts` | create | impure: run quick_check, daily backup, request repair, read notice |
| `apps/desktop/src/App.tsx` | modify | handle open failure / corruption → repair screen; show post-repair notice; start backup |
| `apps/desktop/src/App.css` | modify | repair screen styles |
| `apps/desktop/tsconfig.json` | modify only if absent | `"exclude": ["src/**/*.test.ts"]`. The Reading plan adds it; skip if it's already there. |

---

### Task 1: The user applies the pending Supabase migrations

No code. This removes the root cause of the constant full re-download.

- [x] **Step 1: Check which migrations are already applied.** Save `check-schema.mjs` in your scratchpad (together with `cdp.mjs`, copied verbatim from the Appendix of `docs/superpowers/plans/2026-09-26-gd-prep.md`).
  - The app must be running with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`. If it isn't, ask the user to quit it from the tray first, then launch it that way.
  - The anon key is public and already embedded in the built app. Find it with: `grep -o 'eyJ[A-Za-z0-9_-]\{20,\}\.[A-Za-z0-9_-]\{20,\}\.[A-Za-z0-9_-]\{20,\}' apps/desktop/dist/assets/*.js | head -1`. It must decode to `"role":"anon"`, never `service_role`.

```js
import { connectMain } from "./cdp.mjs";
const ANON = process.argv[2];
const { ev, close } = await connectMain();
console.log(await ev(`(async () => {
  const token = JSON.parse(localStorage.getItem('sb-deerzvowlzgzulnjewki-auth-token')).access_token;
  const h = { Authorization: 'Bearer ' + token, apikey: ${JSON.stringify(ANON)} };
  const probe = async (path) => { const r = await fetch('https://deerzvowlzgzulnjewki.supabase.co/rest/v1/' + path, { headers: h }); return r.status + ' ' + (await r.text()).slice(0, 120); };
  return JSON.stringify({
    '0005 projects.subject_id': await probe('projects?select=subject_id&limit=1'),
    '0006 saved_articles': await probe('saved_articles?select=id&limit=1'),
    '0007 watchlist_items': await probe('watchlist_items?select=id&limit=1'),
  }, null, 1);
})()`));
close(); setTimeout(() => process.exit(0), 200);
```

  Run it: `node check-schema.mjs <anon-key>`. A `200` means applied. A `400`/`404` mentioning a missing column or table means not applied.
  - **0008** (the attendance check constraint) can't be probed by reading. If 0006 and 0007 are missing, assume 0008 is too. Running it again is harmless: it uses `drop constraint if exists`.

- [x] **Step 2: Hand the user the SQL, one file at a time,** only for the missing ones, in order 0005 → 0006 → 0007 → 0008.
  - Read each file with the Read tool and paste its full content into your message inside a ```sql block.
  - Instructions for the user: "Open supabase.com → your project → SQL Editor → New query, paste this, press Run, and tell me what it says."
  - Wait for their reply before giving the next one.
  - **If a file errors, stop and explain it plainly.** Don't edit migrations to force them through.

- [x] **Step 3: Verify.**
  - Rerun `check-schema.mjs`: all 200.
  - Wait about 5 minutes (two sync rounds), then read `SELECT * FROM sync_meta` via IPC. Expect a row with `key = 'last_pulled_at'`.
  - Capture console logs for 2 minutes (`logs` from `connectMain`). Expect no `pull(saved_articles) failed` or `pull(watchlist_items) failed`.

---

### Task 2: Pure health logic + tests

**Files:**
- Create: `apps/desktop/src/lib/db-health-logic.ts`
- Test: `apps/desktop/src/lib/db-health-logic.test.ts`
- Modify (if not already done by the Reading plan): `apps/desktop/tsconfig.json`, adding `"exclude": ["src/**/*.test.ts"],` after `"include": ["src"],`.

**Interfaces:**
- Produces:
  - `isCorruptionError(err: unknown): boolean`
  - `quickCheckOk(rows: unknown): boolean`
  - `localDay(d: Date): string` (`YYYY-MM-DD`)
  - `repairStamp(d: Date): string` (`YYYY-MM-DD-HHMM`)
  - `isBackupDue(lastDay: string | null, today: string): boolean`

- [x] **Step 1: Write the failing test** — `apps/desktop/src/lib/db-health-logic.test.ts`:

```ts
// Run from packages/core:  npx vitest run --root ../../apps/desktop/src/lib --globals
import { isBackupDue, isCorruptionError, localDay, quickCheckOk, repairStamp } from "./db-health-logic.ts";

describe("isCorruptionError", () => {
  it("recognises SQLite corruption messages", () => {
    expect(isCorruptionError("error returned from database: (code: 11) database disk image is malformed")).toBe(true);
    expect(isCorruptionError(new Error("file is not a database"))).toBe(true);
    expect(isCorruptionError({ message: "(code: 26) file is not a database" })).toBe(true);
  });
  it("ignores ordinary errors", () => {
    expect(isCorruptionError("no such table: foo")).toBe(false);
    expect(isCorruptionError(new Error("database is locked"))).toBe(false);
    expect(isCorruptionError(undefined)).toBe(false);
  });
});

describe("quickCheckOk", () => {
  it("accepts exactly one ok row", () => {
    expect(quickCheckOk([{ quick_check: "ok" }])).toBe(true);
  });
  it("rejects problem reports and junk", () => {
    expect(quickCheckOk([{ quick_check: "*** in database main ***\nPage 5: btreeInitPage() returns error code 11" }])).toBe(false);
    expect(quickCheckOk([{ quick_check: "ok" }, { quick_check: "row 3 missing from index" }])).toBe(false);
    expect(quickCheckOk([])).toBe(false);
    expect(quickCheckOk(null)).toBe(false);
  });
});

describe("dates", () => {
  const d = new Date(2026, 8, 5, 7, 3); // 5 Sep 2026 07:03 local
  it("formats a local day and a repair stamp", () => {
    expect(localDay(d)).toBe("2026-09-05");
    expect(repairStamp(d)).toBe("2026-09-05-0703");
  });
  it("is due only when the day changed", () => {
    expect(isBackupDue(null, "2026-09-05")).toBe(true);
    expect(isBackupDue("2026-09-04", "2026-09-05")).toBe(true);
    expect(isBackupDue("2026-09-05", "2026-09-05")).toBe(false);
  });
});
```

- [x] **Step 2: Run it to make sure it fails.** From `packages/core`: `npx vitest run --root ../../apps/desktop/src/lib --globals`. Expected: FAIL on `./db-health-logic.ts`. Other test files in that folder may pass.

- [x] **Step 3: Implement** — `apps/desktop/src/lib/db-health-logic.ts`:

```ts
// Pure decisions for the local-database health check and daily backup.
// No imports, so it's unit-testable (db-health-logic.test.ts).

const CORRUPTION = /malformed|not a database|file is encrypted|\(code: (11|26)\)/i;

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "";
}

/** SQLITE_CORRUPT (11) / SQLITE_NOTADB (26) and their usual messages. */
export function isCorruptionError(err: unknown): boolean {
  return CORRUPTION.test(messageOf(err));
}

/** PRAGMA quick_check returns exactly [{quick_check:"ok"}] when healthy. */
export function quickCheckOk(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length !== 1) return false;
  const row = rows[0] as Record<string, unknown> | null;
  return !!row && Object.values(row)[0] === "ok";
}

const pad = (n: number) => String(n).padStart(2, "0");

export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function repairStamp(d: Date): string {
  return `${localDay(d)}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function isBackupDue(lastDay: string | null, today: string): boolean {
  return lastDay !== today;
}
```

- [x] **Step 4: Run the tests and make sure they pass.** Same command. Expected: all `db-health-logic` tests pass (6).

---

### Task 3: Rust — backup prep, repair request, repair on startup

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Produces three Tauri commands, invoked from JS via `invoke` from `@tauri-apps/api/core`:
  - `prepare_backup(day: String, keep: u32) -> Result<String, String>`. Returns the absolute target path for `VACUUM INTO`.
  - `request_db_repair(stamp: String) -> Result<(), String>`. Writes the marker, then restarts the app.
  - `take_repair_notice() -> Option<String>`. Returns the quarantine folder once, then deletes the notice.

  JS invoke arg names are camelCase of the Rust params: `{ day, keep }` and `{ stamp }`.

- [x] **Step 1: Add the helpers and commands.** In `lib.rs`, directly **above** the line `#[cfg_attr(mobile, tauri::mobile_entry_point)]`, insert:

```rust
// ---------------------------------------------------------------------------
// Local database safety net (docs/superpowers/specs/2026-09-28-reliability-design.md)
// ---------------------------------------------------------------------------

const DB_FILE: &str = "academic-os.db";
const REPAIR_MARKER: &str = "repair-requested";
const REPAIR_NOTICE: &str = "repair-notice.txt";

/// Only digits and dashes — these strings become folder/file names.
fn is_safe_stamp(s: &str) -> bool {
    !s.is_empty() && s.len() <= 20 && s.chars().all(|c| c.is_ascii_digit() || c == '-')
}

/// Moves academic-os.db and its -wal/-shm siblings (whichever exist) into
/// `<dir>/corrupted-backup-<stamp>/`. Never deletes anything. Returns the
/// folder path.
fn quarantine_db_files(dir: &std::path::Path, stamp: &str) -> std::io::Result<std::path::PathBuf> {
    let target = dir.join(format!("corrupted-backup-{stamp}"));
    std::fs::create_dir_all(&target)?;
    for name in [DB_FILE.to_string(), format!("{DB_FILE}-wal"), format!("{DB_FILE}-shm")] {
        let from = dir.join(&name);
        if from.exists() {
            std::fs::rename(&from, target.join(&name))?;
        }
    }
    Ok(target)
}

/// Keeps at most `keep_before_new` existing daily backups (newest by name —
/// names are academic-os-YYYY-MM-DD.db so they sort by date), and removes a
/// same-day file so VACUUM INTO (which refuses to overwrite) can write it.
fn prune_backups(backups: &std::path::Path, today_file: &str, keep_before_new: usize) -> std::io::Result<()> {
    let mut names: Vec<String> = std::fs::read_dir(backups)?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.starts_with("academic-os-") && n.ends_with(".db"))
        .collect();
    if names.iter().any(|n| n == today_file) {
        std::fs::remove_file(backups.join(today_file))?;
        names.retain(|n| n != today_file);
    }
    names.sort();
    let excess = names.len().saturating_sub(keep_before_new);
    for old in names.iter().take(excess) {
        std::fs::remove_file(backups.join(old))?;
    }
    Ok(())
}

#[tauri::command]
fn prepare_backup(app: tauri::AppHandle, day: String, keep: u32) -> Result<String, String> {
    if !is_safe_stamp(&day) || keep == 0 {
        return Err("invalid backup arguments".into());
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = format!("academic-os-{day}.db");
    prune_backups(&dir, &file, (keep as usize).saturating_sub(1)).map_err(|e| e.to_string())?;
    Ok(dir.join(file).to_string_lossy().to_string())
}

/// Called by the main window when the local DB is corrupt. The files can't
/// be moved now (the SQL plugin holds them open, and it only runs
/// migrations on the first load per process), so leave a marker and
/// restart; perform_pending_repair() does the move before anything reopens it.
#[tauri::command]
fn request_db_repair(app: tauri::AppHandle, stamp: String) -> Result<(), String> {
    if !is_safe_stamp(&stamp) {
        return Err("invalid stamp".into());
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::write(dir.join(REPAIR_MARKER), stamp).map_err(|e| e.to_string())?;
    app.request_restart();
    Ok(())
}

#[tauri::command]
fn take_repair_notice(app: tauri::AppHandle) -> Option<String> {
    let path = app.path().app_config_dir().ok()?.join(REPAIR_NOTICE);
    let text = std::fs::read_to_string(&path).ok()?;
    let _ = std::fs::remove_file(&path);
    Some(text)
}

/// Runs at the very top of setup(), before any window can call the SQL
/// plugin's load, so nothing holds the database open yet.
fn perform_pending_repair(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_config_dir() else { return };
    let marker = dir.join(REPAIR_MARKER);
    let Ok(stamp) = std::fs::read_to_string(&marker) else { return };
    let stamp = stamp.trim().to_string();
    let _ = std::fs::remove_file(&marker);
    if !is_safe_stamp(&stamp) {
        return;
    }
    match quarantine_db_files(&dir, &stamp) {
        Ok(folder) => {
            let _ = std::fs::write(dir.join(REPAIR_NOTICE), folder.to_string_lossy().as_bytes());
        }
        Err(e) => eprintln!("database repair failed: {e}"),
    }
}

#[cfg(test)]
mod db_safety_tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("academicos-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn stamps_are_validated() {
        assert!(is_safe_stamp("2026-09-28-1241"));
        assert!(!is_safe_stamp("../evil"));
        assert!(!is_safe_stamp(""));
    }

    #[test]
    fn quarantine_moves_existing_files_only() {
        let d = temp_dir("quarantine");
        std::fs::write(d.join("academic-os.db"), b"db").unwrap();
        std::fs::write(d.join("academic-os.db-wal"), b"wal").unwrap();
        let folder = quarantine_db_files(&d, "2026-09-28-1241").unwrap();
        assert!(!d.join("academic-os.db").exists());
        assert_eq!(std::fs::read(folder.join("academic-os.db")).unwrap(), b"db");
        assert_eq!(std::fs::read(folder.join("academic-os.db-wal")).unwrap(), b"wal");
        assert!(!folder.join("academic-os.db-shm").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn prune_keeps_newest_and_clears_same_day() {
        let d = temp_dir("prune");
        for day in ["01", "02", "03", "04", "05", "06", "07", "08"] {
            std::fs::write(d.join(format!("academic-os-2026-09-{day}.db")), b"x").unwrap();
        }
        std::fs::write(d.join("unrelated.txt"), b"keep me").unwrap();
        prune_backups(&d, "academic-os-2026-09-08.db", 6).unwrap();
        let mut left: Vec<String> = std::fs::read_dir(&d).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        left.sort();
        assert_eq!(
            left,
            vec![
                "academic-os-2026-09-02.db", "academic-os-2026-09-03.db", "academic-os-2026-09-04.db",
                "academic-os-2026-09-05.db", "academic-os-2026-09-06.db", "academic-os-2026-09-07.db",
                "unrelated.txt",
            ]
        );
        let _ = std::fs::remove_dir_all(&d);
    }
}
```

- [x] **Step 2: Register the commands.** Change:

```rust
        .invoke_handler(tauri::generate_handler![start_oauth_server, toggle_widgets, dock_widgets])
```

  to:

```rust
        .invoke_handler(tauri::generate_handler![
            start_oauth_server,
            toggle_widgets,
            dock_widgets,
            prepare_backup,
            request_db_repair,
            take_repair_notice
        ])
```

- [x] **Step 3: Run a pending repair first thing in `setup()`.** Directly after `.setup(|app| {`, insert:

```rust
            // Must run before anything else: finishes a repair the previous
            // run requested, while no window has opened the database yet.
            perform_pending_repair(app.handle());

```

- [x] **Step 4: Run the Rust unit tests.** PowerShell:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; Set-Location "C:\Users\rpran\Apps\Event Planner\apps\desktop\src-tauri"; cargo test --lib db_safety_tests 2>&1 | Select-Object -Last 15
```

  Expected: `test result: ok. 3 passed`. The first run compiles the app in debug mode and can take several minutes. This doesn't touch the release binary or the live database.
  - **If `cargo test` fails to compile because `frontendDist` is missing**, run `pnpm --filter @academic-os/desktop build` first (it only builds `dist/`), then retry.

- [x] **Step 5: Check the capabilities.** Custom app commands are allowed by default in Tauri 2 unless the project restricts them. Run `grep -rn "app_manifest\|AppManifest" apps/desktop/src-tauri/build.rs`.
  - **If there's no match:** nothing to do.
  - **If there is a match:** stop and tell the user the three commands need adding to the app manifest.

---

### Task 4: JS — health check, daily backup, repair screen, notice

**Files:**
- Create: `apps/desktop/src/lib/db-health.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.css` (append)

**Interfaces:**
- Consumes: Task 2 logic and Task 3 commands.
- Produces:
  - `checkDatabase(db: SqliteLocalDb): Promise<boolean>`
  - `maybeDailyBackup(db: SqliteLocalDb): Promise<void>`
  - `requestRepair(): Promise<void>`
  - `takeRepairNotice(): Promise<string | null>`

- [x] **Step 1: Create `apps/desktop/src/lib/db-health.ts`:**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { SqliteLocalDb } from "./sqlite-local-db";
import { isBackupDue, isCorruptionError, localDay, quickCheckOk, repairStamp } from "./db-health-logic";

// The local SQLite file has gone fully corrupt twice (2026-09-07 and
// 2026-09-28). This is the safety net: a quick integrity check on every
// start, one-click repair (Rust moves the damaged file aside on restart and
// the app rebuilds from Supabase), and 7 rolling daily backups for the
// local-only tables a resync can't restore.

const LAST_BACKUP_KEY = "academicos.lastBackupDay";
const KEEP_BACKUPS = 7;

/** true = healthy. Only a real corruption signal returns false — any other
 * error (e.g. a transient lock) is treated as healthy so we never repair a
 * good database by mistake. */
export async function checkDatabase(db: SqliteLocalDb): Promise<boolean> {
  try {
    return quickCheckOk(await db.raw.select("PRAGMA quick_check"));
  } catch (err) {
    console.error("quick_check failed:", err);
    return !isCorruptionError(err);
  }
}

export async function maybeDailyBackup(db: SqliteLocalDb): Promise<void> {
  const today = localDay(new Date());
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    /* ignore */
  }
  if (!isBackupDue(last, today)) return;
  try {
    const target = await invoke<string>("prepare_backup", { day: today, keep: KEEP_BACKUPS });
    await db.raw.execute("VACUUM INTO $1", [target]);
    try {
      localStorage.setItem(LAST_BACKUP_KEY, today);
    } catch {
      /* ignore */
    }
  } catch (err) {
    // Never blocks startup; retried next launch.
    console.error("daily backup failed:", err);
  }
}

/** Restarts the app; the damaged file is moved aside before it reopens. */
export async function requestRepair(): Promise<void> {
  await invoke("request_db_repair", { stamp: repairStamp(new Date()) });
}

export async function takeRepairNotice(): Promise<string | null> {
  try {
    return (await invoke<string | null>("take_repair_notice")) ?? null;
  } catch {
    return null;
  }
}

export { isCorruptionError };
```

  If `VACUUM INTO $1` fails because the bound parameter isn't accepted (the error message will mention syntax or near "$1"), switch to a literal with escaped quotes: ``await db.raw.execute(`VACUUM INTO '${target.replace(/'/g, "''")}'`);``. `target` comes from our own Rust command, not the user, so escaping quotes is sufficient.

- [x] **Step 2: Wire it into `App.tsx`.**
  1. Add the import next to the other `./lib/…` imports: `import { checkDatabase, isCorruptionError, maybeDailyBackup, requestRepair, takeRepairNotice } from "./lib/db-health";`
  2. Add state next to `const [localDb, setLocalDb] = …`: `const [dbBroken, setDbBroken] = useState(false);`
  3. Replace the line `void SqliteLocalDb.open().then(async (db) => {` with:

```tsx
    void SqliteLocalDb.open()
      .catch((err) => {
        // A corrupt file makes the plugin's first load (which runs the
        // migrations) throw before we ever get a handle.
        if (isCorruptionError(err)) setDbBroken(true);
        else console.error("opening the local database failed:", err);
        return null;
      })
      .then(async (db) => {
      if (!db) return;
      if (!(await checkDatabase(db))) {
        setDbBroken(true);
        return;
      }
      const notice = await takeRepairNotice();
      if (notice) {
        notify(
          `Your local copy was damaged, so the app rebuilt it from your Supabase copy. The damaged file was kept in ${notice}. Daily backups are in the "backups" folder next to it.`,
          () => {}
        );
      }
```

  4. Directly after the existing line `stops.push(startGdPrepLoop(db));`, add:

```tsx

      // After the sync loops are going, so a slow backup never delays them.
      void maybeDailyBackup(db);
```

  5. The chain now reads `.catch(…).then(async (db) => { … })`. Make sure the original closing `});` of the `.then` still closes it; the indentation will be off by one level, which is fine. Run `npx tsc --noEmit` to confirm it's balanced.
  6. Add the repair screen. Directly **before** the existing `if (!localDb) {` block, add:

```tsx
  if (dbBroken) {
    return (
      <div className="db-repair">
        <h1>Your local notes database is damaged</h1>
        <p>
          This happens rarely (for example if the app was interrupted while saving). Your notes, tasks and classes
          are safe in your Supabase copy.
        </p>
        <p>
          <strong>Repair and restart</strong> moves the damaged file into a dated backup folder (nothing is
          deleted), restarts the app, and downloads everything again from Supabase. Things that live only on this
          laptop (GD Prep stories, practice progress, note edit history) can be recovered from the daily backups
          folder if needed.
        </p>
        <button className="btn btn--primary" onClick={() => void requestRepair()}>
          Repair and restart
        </button>
      </div>
    );
  }
```

  7. The notice's "Undo" button does nothing for this message. That's acceptable; it's the app's standard toast.

- [x] **Step 3: Append styles** to `apps/desktop/src/App.css`:

```css
/* ============================================================
   Local database repair screen (reliability spec §3)
   ============================================================ */
.db-repair {
  max-width: 560px;
  margin: 12vh auto 0;
  padding: var(--space-6);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
  line-height: 1.55;
}

.db-repair h1 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-xl);
}

.db-repair p {
  margin: 0 0 var(--space-3);
  color: var(--ink-secondary);
}
```

- [x] **Step 4: Typecheck + unit tests.**
  - `cd apps/desktop; npx tsc --noEmit`. Expected: no errors.
  - From `packages/core`: `npx vitest run --root ../../apps/desktop/src/lib --globals`. Expected: all pass.

---

### Task 5: Build and verify (safely)

- [x] **Step 1:** Ask the user to quit the app from the tray, confirm it's closed, then build and launch with CDP (the commands are in the Global Constraints and the GD Prep plan's Task 8).
- [x] **Step 2: Health and backup.** Via IPC, `PRAGMA quick_check` → `[{"quick_check":"ok"}]`. The app shows no repair screen.
  - Run `ls "$APPDATA/com.academicos.app/backups"` (Bash: `ls "/c/Users/rpran/AppData/Roaming/com.academicos.app/backups"`). Expected: `academic-os-<today>.db`.
  - Open the backup **read-only** with Python: `python -c "import sqlite3; c=sqlite3.connect('file:<path>?mode=ro', uri=True); print(c.execute('pragma integrity_check').fetchall(), c.execute('select count(*) from nodes').fetchall())"`. Expected: `[('ok',)]` and a non-zero count.
- [ ] **Step 3: Relaunch.** Ask the user to quit and reopen the app normally. The backup must **not** be recreated that same day (the file's modification time is unchanged).
- [x] **Step 4: Repair path.** Covered by the Rust unit tests (`quarantine_db_files`, `prune_backups`) and the pure JS tests. **Do not** simulate corruption on the live database, and don't add a debug flag to trigger it. Tell the user that the real test is the next time it's ever needed.
- [x] **Step 5:** Report plainly to the user: migrations applied, backups running (where they live), and what the repair screen would look like if it ever appears.

---

### Task 6: Documentation

- [x] **CLAUDE.md:** add a "Reliability safety net (built <date>)" bullet covering:
  - backups (location, 7 kept, `VACUUM INTO`);
  - the startup `quick_check`, the repair screen, and the marker + `request_restart` + `perform_pending_repair` flow;
  - why not reload (migrations run once per process in plugin-sql 2.4.1);
  - migrations 0005–0008 now applied.

  Also remove the "user must run 0006/0007" notes elsewhere in CLAUDE.md, now that they're applied.
- [x] **Memory:** update `project_db_corruption_incidents.md`. The automatic repair now exists; the manual procedure is only a fallback. Mention the backups folder.
- [x] **LEARNING.md** (untracked): add a short "Backups and self-repair" section. Explain what `VACUUM INTO` is, why corruption repair needs a restart, and why local-first makes the rebuild possible.
- [ ] **Report to the user.** Nothing is committed.
