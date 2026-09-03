import { useEffect, useRef, useState } from "react";
import { extractAttachmentText, type LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { supabase } from "../lib/supabase";
import { writeFile, mkdir, BaseDirectory } from "@tauri-apps/plugin-fs";
import { tempDir, join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openPath } from "@tauri-apps/plugin-opener";

/** Windows forbids these in filenames; strip them for the cache copy. */
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_");
}

function isPreviewable(mime: string | null): boolean {
  return mime !== null && (mime.startsWith("image/") || mime === "application/pdf");
}

interface AttachmentsRailProps {
  localDb: SqliteLocalDb;
  userId: string;
  node: LocalRow;
  onChanged: () => void;
}

/**
 * Attachments on a node — folder or page, per design manual §1.6. Files
 * never touch the client directly: uploads/downloads go through the
 * drive-upload / drive-fetch Edge Functions, which hold the only Google
 * credentials that exist anywhere (supabase/functions/_shared/google-drive.ts).
 * The DB only ever stores the returned Drive file id.
 */
export function AttachmentsRail({ localDb, userId, node, onChanged }: AttachmentsRailProps) {
  const [attachments, setAttachments] = useState<LocalRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    const rows = await localDb.raw.select<Record<string, unknown>[]>(
      "SELECT * FROM attachments WHERE node_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC",
      [node.id]
    );
    setAttachments(rows as LocalRow[]);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("filename", file.name);
        const { data, error: fnError } = await supabase.functions.invoke("drive-upload", {
          body: form,
        });
        if (fnError) throw fnError;
        const driveFileId = (data as { driveFileId: string }).driveFileId;

        // Extracted from the local File we already have in hand — no
        // need to round-trip through Drive for this. null for types with
        // no extraction path (images, spreadsheets, ...); that's fine,
        // they just won't be full-text searchable (§1.7/§1.8).
        const bytes = new Uint8Array(await file.arrayBuffer());
        const extractedText = await extractAttachmentText(file.type || null, bytes);

        await localDb.put("attachments", {
          id: crypto.randomUUID(),
          user_id: userId,
          node_id: node.id as string,
          drive_file_id: driveFileId,
          filename: file.name,
          mime: file.type || null,
          size_bytes: file.size,
          extracted_text: extractedText,
          local_path: null,
          ocr_status: "skipped",
          capture_group_id: null,
          capture_index: null,
        });
      }
      await refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /**
   * Images and PDFs open in a small in-app preview window — a webview can
   * render those natively. Everything else (xlsx, docx, ...) has no
   * browser-renderable form at all, so it opens in its normal OS default
   * app instead; there's no in-app window that could show it regardless.
   */
  async function handleOpen(att: LocalRow) {
    setError(null);
    try {
      // Raw fetch, not supabase.functions.invoke(): that helper only
      // auto-parses a response as a Blob for a couple of known
      // content-types (application/pdf, application/octet-stream) —
      // anything else, like an .xlsx mime type, silently falls through
      // to .text() and corrupts the binary data.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/drive-fetch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? anonKey}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ driveFileId: att["drive_file_id"] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const bytes = new Uint8Array(await res.arrayBuffer());

      // Written under the OS temp dir, not the app's own AppData cache —
      // Windows/Office refuses to open files from an app's private
      // AppData folder ("couldn't find" is the actual error it gives,
      // despite the file being right there and perfectly valid), but
      // %TEMP% is a location every app can open without issue.
      // Cached by attachment id, so re-opening the same file reuses one
      // file on disk instead of piling up copies.
      await mkdir("academicos", { baseDir: BaseDirectory.Temp, recursive: true });
      const relativePath = `academicos/${att.id as string}-${sanitizeFilename(att["filename"] as string)}`;
      await writeFile(relativePath, bytes, { baseDir: BaseDirectory.Temp });
      const fullPath = await join(await tempDir(), relativePath);

      const mime = att["mime"] as string | null;
      if (isPreviewable(mime)) {
        const preview = new WebviewWindow(`preview-${att.id as string}`, {
          url: convertFileSrc(fullPath),
          title: att["filename"] as string,
          width: 800,
          height: 700,
        });
        preview.once("tauri://error", (e) => setError(String(e.payload)));
      } else {
        await openPath(fullPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(att: LocalRow) {
    await localDb.put("attachments", {
      id: att.id as string,
      user_id: userId,
      deleted_at: new Date().toISOString(),
    });
    await refresh();
    onChanged();
  }

  return (
    <div className="attachments-rail">
      <div className="attachments-rail__header">
        <h3 className="attachments-rail__title">Attachments</h3>
        <button disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? "Uploading…" : "+ Attach file"}
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>
      {error && <p className="attachments-rail__error">{error}</p>}
      {attachments.length === 0 ? (
        <p className="attachments-rail__empty">No attachments.</p>
      ) : (
        <ul className="attachments-rail__list">
          {attachments.map((att) => (
            <li key={att.id as string} className="attachments-rail__item">
              <button className="attachments-rail__filename" onClick={() => void handleOpen(att)}>
                {att["filename"] as string}
              </button>
              <button className="attachments-rail__delete" onClick={() => void handleDelete(att)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
