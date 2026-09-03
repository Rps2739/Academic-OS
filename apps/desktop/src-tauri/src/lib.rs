use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_sql::{Migration, MigrationKind};

const DB_URL: &str = "sqlite:academic-os.db";
const OAUTH_SCHEME: &str = "academicos://";

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
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin registered. On Windows/Linux, completing
        // the Google OAuth flow in the system browser relaunches the app as
        // a SECOND process with the academicos:// callback URL as a CLI
        // arg; this plugin detects that, forwards the URL to the already-
        // running instance via an event, and exits the second process.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = argv.iter().find(|a| a.starts_with(OAUTH_SCHEME)) {
                let _ = app.emit("oauth-callback", url.clone());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // In dev builds the installer hasn't registered the URL scheme
            // yet — register it for this run so the OAuth callback works
            // without a full production build. Release builds register it
            // automatically at install time.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                app.deep_link().register_all()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
