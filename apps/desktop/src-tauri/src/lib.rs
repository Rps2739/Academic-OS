use std::io::{Read, Write};
use std::net::TcpListener;
use tauri::{Emitter, Manager};
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
    }]
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
        .invoke_handler(tauri::generate_handler![start_oauth_server])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
