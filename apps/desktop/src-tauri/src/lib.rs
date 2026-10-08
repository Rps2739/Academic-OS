use std::io::{Read, Write};
use std::net::TcpListener;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, PhysicalPosition, Position, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_sql::{Migration, MigrationKind};

const DB_URL: &str = "sqlite:academic-os.db";

/// Fixed port for the OAuth loopback redirect — must match the URL entered
/// in Supabase's Redirect URLs allow list (http://127.0.0.1:17823/callback).
/// A custom academicos:// URL scheme was tried first, but Chrome silently
/// drops external-protocol redirects that arrive via Google's own internal
/// redirect chain; a plain http:// loopback is the standard, reliable
/// pattern desktop OAuth clients use instead (same approach as `gcloud`,
/// the GitHub CLI, etc.).
const OAUTH_CALLBACK_PORT: u16 = 17823;

/// Starts a one-shot local HTTP server, waits for the single OAuth redirect
/// request on a background thread, extracts `code` from its query string,
/// and emits it to the frontend as "oauth-callback". Returns the port so
/// the frontend can build the exact `redirectTo` URL.
#[tauri::command]
fn start_oauth_server(app: tauri::AppHandle) -> Result<u16, String> {
    let listener =
        TcpListener::bind(("127.0.0.1", OAUTH_CALLBACK_PORT)).map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        let Ok((mut stream, _)) = listener.accept() else {
            return;
        };
        let mut buf = [0u8; 8192];
        let n = stream.read(&mut buf).unwrap_or(0);
        let request = String::from_utf8_lossy(&buf[..n]);
        let code = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|path| path.split_once("code="))
            .map(|(_, rest)| rest.split(['&', ' ']).next().unwrap_or("").to_string());

        let body = "<html><body style=\"font-family:sans-serif;text-align:center;margin-top:20vh\">\
                     <h2>Signed in</h2><p>You can close this tab and return to Academic OS.</p>\
                     </body></html>";
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(response.as_bytes());

        if let Some(code) = code.filter(|c| !c.is_empty()) {
            let _ = app.emit("oauth-callback", code);
        }
    });

    Ok(OAUTH_CALLBACK_PORT)
}

/// Local mirror schema — must stay in step with
/// packages/core/src/sync/sqlite-schema.ts (TABLE_COLUMNS/PK_COLUMN). Each
/// synced table gets the same columns as its Postgres counterpart plus a
/// local-only `dirty` flag; `sync_meta` holds the pull cursor and this
/// device's id; `page_versions_local` is the conflict safety net described
/// in the design manual §7.
fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "init_local_mirror",
        kind: MigrationKind::Up,
        sql: "
            CREATE TABLE subjects (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, deleted_at TEXT,
                name TEXT NOT NULL, code TEXT, term TEXT, node_id TEXT, aliases TEXT,
                dirty INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE projects (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, deleted_at TEXT,
                name TEXT NOT NULL, kind TEXT, stage TEXT, deadline TEXT, team TEXT,
                node_id TEXT, status TEXT,
                dirty INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE nodes (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, deleted_at TEXT,
                parent_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, icon TEXT,
                sort_order REAL NOT NULL DEFAULT 0,
                dirty INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX nodes_parent_idx ON nodes (parent_id);
            CREATE TABLE page_bodies (
                node_id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                blocks TEXT NOT NULL DEFAULT '[]', markdown TEXT NOT NULL DEFAULT '',
                plaintext TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                dirty INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE tasks (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, deleted_at TEXT,
                title TEXT NOT NULL, notes TEXT, due_at TEXT, status TEXT NOT NULL DEFAULT 'open',
                priority INTEGER NOT NULL DEFAULT 0, completed_at TEXT,
                sort_order REAL NOT NULL DEFAULT 0, node_id TEXT, project_id TEXT,
                dirty INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX tasks_due_idx ON tasks (due_at);
            CREATE TABLE attachments (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, deleted_at TEXT,
                node_id TEXT NOT NULL, drive_file_id TEXT, filename TEXT NOT NULL, mime TEXT,
                size_bytes INTEGER, extracted_text TEXT, local_path TEXT,
                ocr_status TEXT NOT NULL DEFAULT 'skipped',
                capture_group_id TEXT, capture_index INTEGER,
                dirty INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX attachments_node_idx ON attachments (node_id);
            CREATE TABLE timetable_imports (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, deleted_at TEXT,
                source TEXT NOT NULL, source_message_id TEXT, received_at TEXT NOT NULL,
                week_start TEXT NOT NULL, raw TEXT NOT NULL, checksum TEXT NOT NULL,
                parsed_ok INTEGER NOT NULL DEFAULT 0, parse_error TEXT, superseded_by TEXT,
                dirty INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE class_sessions (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, deleted_at TEXT,
                import_id TEXT, week_start TEXT NOT NULL, starts_at TEXT NOT NULL,
                ends_at TEXT NOT NULL, subject_id TEXT, subject_label TEXT NOT NULL,
                faculty TEXT, room TEXT, session_type TEXT,
                status TEXT NOT NULL DEFAULT 'scheduled', gcal_event_id TEXT,
                dirty INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX class_sessions_starts_idx ON class_sessions (starts_at);
            CREATE TABLE attendance_marks (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, deleted_at TEXT,
                subject_id TEXT NOT NULL, class_session_id TEXT, marked_for TEXT NOT NULL,
                state TEXT NOT NULL,
                dirty INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE sync_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE page_versions_local (
                id TEXT PRIMARY KEY,
                node_id TEXT NOT NULL,
                blocks TEXT,
                markdown TEXT,
                device_id TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX page_versions_local_node_idx ON page_versions_local (node_id, created_at DESC);
        ",
    }, Migration {
        version: 2,
        description: "timetable_imports_drive_file",
        kind: MigrationKind::Up,
        sql: "
            ALTER TABLE timetable_imports ADD COLUMN drive_file_id TEXT;
            ALTER TABLE timetable_imports ADD COLUMN original_filename TEXT;
        ",
    }, Migration {
        version: 3,
        description: "projects_subject_id",
        kind: MigrationKind::Up,
        sql: "
            ALTER TABLE projects ADD COLUMN subject_id TEXT;
        ",
    }, Migration {
        // Local-only cache for the News dashboard — deliberately NOT in
        // SYNC_TABLES (same pattern as page_versions_local): news content is
        // re-fetchable from the internet, not user data, so it never needs to
        // reach Postgres or another device. Read/written via localDb.raw.
        version: 4,
        description: "news_cache_local",
        kind: MigrationKind::Up,
        sql: "
            CREATE TABLE news_items_local (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                link TEXT NOT NULL,
                source TEXT,
                summary TEXT,
                published_at TEXT,
                fetched_at TEXT NOT NULL
            );
            CREATE INDEX idx_news_cat_pub ON news_items_local (category, published_at DESC);
        ",
    }, Migration {
        version: 5,
        description: "saved_articles",
        kind: MigrationKind::Up,
        sql: "
            CREATE TABLE saved_articles (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, deleted_at TEXT,
                title TEXT NOT NULL, link TEXT NOT NULL, source TEXT, summary TEXT,
                category TEXT, published_at TEXT, note TEXT,
                dirty INTEGER NOT NULL DEFAULT 0
            );
        ",
    }, Migration {
        version: 6,
        description: "watchlist_items",
        kind: MigrationKind::Up,
        sql: "
            CREATE TABLE watchlist_items (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, deleted_at TEXT,
                symbol TEXT NOT NULL, kind TEXT NOT NULL, display_name TEXT,
                scheme_code TEXT, sort_order REAL NOT NULL DEFAULT 0,
                dirty INTEGER NOT NULL DEFAULT 0
            );
        ",
    }, Migration {
        // How many distinct curated outlets ran essentially the same story —
        // the corroboration-based ranking signal computed by news-fetch.
        version: 7,
        description: "news_cache_source_count",
        kind: MigrationKind::Up,
        sql: "
            ALTER TABLE news_items_local ADD COLUMN source_count INTEGER NOT NULL DEFAULT 1;
        ",
    }, Migration {
        // Local-only safety net (never synced, same pattern as
        // page_versions_local): every sync-conflict resolution outside
        // page_bodies used to just silently overwrite the losing local
        // edit with nothing kept. This gives it somewhere to land instead
        // of vanishing — see packages/core/src/sync/engine.ts.
        version: 8,
        description: "sync_conflicts_local",
        kind: MigrationKind::Up,
        sql: "
            CREATE TABLE sync_conflicts_local (
                id TEXT PRIMARY KEY, table_name TEXT NOT NULL, row_id TEXT NOT NULL,
                local_row TEXT NOT NULL, remote_row TEXT NOT NULL,
                device_id TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE INDEX idx_sync_conflicts_row ON sync_conflicts_local (table_name, row_id);
        ",
    }, Migration {
        // GD Prep (docs/superpowers/specs/2026-09-26-gd-prep-design.md).
        // Local-only by the user's choice — deliberately NOT in SYNC_TABLES,
        // read/written via localDb.raw like news_items_local. UNIQUE(link)
        // stops the same story being stored twice; a deleted row keeps its
        // link so a scheduled scan can't bring back something the user removed.
        // gd_seen_local remembers which headlines were already shown to
        // Gemini so each scheduled scan only sends new ones.
        version: 9,
        description: "gd_prep_local",
        kind: MigrationKind::Up,
        sql: "
            CREATE TABLE gd_prep_local (
                id TEXT PRIMARY KEY, added_at TEXT NOT NULL, deleted_at TEXT,
                title TEXT NOT NULL, link TEXT NOT NULL UNIQUE, source TEXT, summary TEXT, published_at TEXT,
                theme TEXT, why TEXT, points_for TEXT, points_against TEXT, key_facts TEXT, question TEXT,
                manual INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX idx_gd_prep_added ON gd_prep_local (added_at DESC);
            CREATE TABLE gd_seen_local (id TEXT PRIMARY KEY, seen_at TEXT NOT NULL);
        ",
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
    }, Migration {
        // Interviewer (docs/superpowers/specs/2026-09-28-interviewer-design.md).
        // Local-only; covered by the daily backup. One row per attempt.
        version: 11,
        description: "interviewer_local",
        kind: MigrationKind::Up,
        sql: "
            CREATE TABLE interview_attempts_local (
                id TEXT PRIMARY KEY, question_id TEXT NOT NULL, section TEXT NOT NULL,
                answer TEXT, checked_points TEXT, score INTEGER NOT NULL,
                attempted_at TEXT NOT NULL, next_due_at TEXT NOT NULL
            );
            CREATE INDEX idx_interview_attempts_q ON interview_attempts_local (question_id, attempted_at DESC);
            CREATE TABLE interview_cv_local (id TEXT PRIMARY KEY, text TEXT NOT NULL, updated_at TEXT NOT NULL);
        ",
    }]
}

/// Opened by the tray menu's "Quick capture" item and by the global
/// Ctrl+Alt+N shortcut (design manual §2.6) — focuses the existing
/// window rather than stacking duplicates if it's already open.
fn open_quick_capture(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("quick-capture") {
        let _ = window.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "quick-capture", WebviewUrl::App("index.html".into()))
        .title("Quick capture")
        .inner_size(480.0, 56.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .resizable(false)
        .center()
        .build();
}

/// Tray menu's "Toggle panels", and the main window's own widgets button
/// (JS calls this via the `toggle_widget_panels` command below — a user
/// can close one panel with its own header button without ever opening
/// the tray, so treating each panel's *own* visibility independently
/// here would make the two controls disagree). Shows both if either is
/// hidden; hides both only when both are already visible.
fn toggle_widget_panels(app: &tauri::AppHandle) {
    let labels = ["widget-tasks", "widget-classes"];
    let all_visible = labels
        .iter()
        .all(|l| app.get_webview_window(l).and_then(|w| w.is_visible().ok()).unwrap_or(false));
    for label in labels {
        if let Some(window) = app.get_webview_window(label) {
            let _ = if all_visible { window.hide() } else { window.show() };
        }
    }
}

#[tauri::command]
fn toggle_widgets(app: tauri::AppHandle) {
    toggle_widget_panels(&app);
}

/// Positions both widget panels flush against the right edge of their
/// current monitor, stacked top-to-bottom — a one-click "put these
/// somewhere out of the way and keep them there" action. Works in
/// physical pixels throughout (both the monitor size and each window's
/// own outer_size come back physical from these APIs), so no DPI/scale-
/// factor conversion is needed. Once moved this way,
/// tauri-plugin-window-state persists the new position across restarts
/// automatically — this only ever needs to be triggered once per
/// monitor setup, not every launch.
fn dock_widgets_right(app: &tauri::AppHandle) {
    const MARGIN: i32 = 20;
    const GAP: i32 = 14;
    let mut next_y = MARGIN;
    for label in ["widget-tasks", "widget-classes"] {
        let Some(window) = app.get_webview_window(label) else { continue };
        // Show BEFORE detecting the monitor: current_monitor() returns
        // None for a window that's currently hidden (or was never shown),
        // which is exactly why the earlier version silently did nothing
        // when the panels were toggled off. Fall back to the primary
        // monitor if the per-window lookup still comes back empty.
        let _ = window.show();
        let monitor = window
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| app.primary_monitor().ok().flatten());
        let Some(monitor) = monitor else { continue };
        let Ok(size) = window.outer_size() else { continue };
        let screen = monitor.size();
        // monitor.position() is the monitor's top-left in the virtual
        // desktop; add it so the right-edge math is correct on a secondary
        // monitor whose origin isn't (0,0), not just the primary.
        let origin = monitor.position();
        let x = origin.x + screen.width as i32 - size.width as i32 - MARGIN;
        let y = origin.y + next_y;
        let _ = window.set_position(Position::Physical(PhysicalPosition { x, y }));
        next_y += size.height as i32 + GAP;
    }
}

#[tauri::command]
fn dock_widgets(app: tauri::AppHandle) {
    dock_widgets_right(&app);
}

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin registered. Just focuses the existing
        // window if a second instance is launched — no OAuth handoff role
        // now that sign-in uses a loopback HTTP server instead of a custom
        // URL scheme.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        // Persists position/size for every window (including the two
        // widget panels) across restarts automatically — design manual §2.3.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        // Ctrl+Alt+N opens quick-capture from anywhere, main window or not.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut("Ctrl+Alt+N")
                .expect("Ctrl+Alt+N is a valid shortcut string")
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        open_quick_capture(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            start_oauth_server,
            toggle_widgets,
            dock_widgets,
            prepare_backup,
            request_db_repair,
            take_repair_notice
        ])
        .setup(|app| {
            // Must run before anything else: finishes a repair the previous
            // run requested, while no window has opened the database yet.
            perform_pending_repair(app.handle());

            // The main window's [X] button used to fully destroy it (Tauri's
            // default) with nothing else registered to recreate it — once
            // destroyed, the tray's "Open" and the single-instance focus
            // handler both call get_webview_window("main"), find nothing,
            // and silently do nothing. Hiding instead of closing keeps the
            // window (and the React tree inside it — including the sync
            // loops that keep the widgets' data fresh) alive in the
            // background, exactly like a normal "close to tray" app.
            if let Some(main_window) = app.get_webview_window("main") {
                let hide_target = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = hide_target.hide();
                    }
                });
            }

            // Tray icon — v2 API is TrayIconBuilder, not v1's SystemTray.
            let open_i = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let capture_i =
                MenuItem::with_id(app, "capture", "Quick capture", true, Some("Ctrl+Alt+N"))?;
            let toggle_i = MenuItem::with_id(app, "toggle", "Toggle panels", true, None::<&str>)?;
            let dock_i = MenuItem::with_id(app, "dock", "Dock widgets right", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &capture_i, &toggle_i, &dock_i, &quit_i])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "capture" => open_quick_capture(app),
                    "toggle" => toggle_widget_panels(app),
                    "dock" => dock_widgets_right(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // Dock the widget panels to the right edge on every launch, so
            // "always snapped to the far right, out of the way" is the
            // default the user asked for rather than something they have to
            // set up each time. Runs after tauri-plugin-window-state has
            // restored positions (setup runs after plugin init), so this
            // deliberately wins over a stale restored position. The panels
            // are still freely draggable during a session; they just return
            // to the right on the next start.
            dock_widgets_right(app.handle());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
