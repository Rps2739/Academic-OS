/** Finds a non-trashed folder by exact name under a given parent (or Drive root
 * when parentId is null), creating it if it doesn't exist yet. Drive's `drive.file`
 * scope only lets the app see files/folders it created itself, so this never
 * collides with folders of the same name the user made by hand elsewhere. */
async function getOrCreateFolder(accessToken: string, name: string, parentId: string | null): Promise<string> {
  const parentClause = parentId ? `'${parentId}' in parents` : "'root' in parents";
  // Backslash must be escaped before the quote, or a name ending in `\`
  // makes the query's own escape-quote swallow the closing `'` (e.g.
  // `foo\` -> `'foo\'` reads as an escaped quote, not a closed string),
  // letting the rest of the crafted name run as unquoted query syntax.
  const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and ${parentClause}`;
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error(`Drive folder lookup failed: ${await listRes.text()}`);
  const { files } = await listRes.json();
  if (files && files.length > 0) return files[0].id as string;

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
  if (!createRes.ok) throw new Error(`Drive folder creation failed: ${await createRes.text()}`);
  const { id } = await createRes.json();
  return id as string;
}

/** Walks a path of folder names from Drive's root, creating any that don't
 * exist yet, and returns the final folder's id — e.g. ["SIBM", "Sem 3", "Business
 * Statistics"] mirrors the same nesting an attachment's node has in the app's own
 * Notes tree, so a file's home in Drive matches where it lives in the app. */
export async function resolveFolderPath(accessToken: string, segments: string[]): Promise<string | null> {
  let parentId: string | null = null;
  for (const raw of segments) {
    const segment = raw.trim();
    if (!segment) continue;
    parentId = await getOrCreateFolder(accessToken, segment, parentId);
  }
  return parentId;
}

// Uploads bytes to the app owner's personal Google Drive (drive.file
// scope) and returns the created file's id. Shared by drive-upload
// (browser-initiated attachment uploads) and timetable-ingest (the
// college Gmail watcher), which both need to hand a file to Drive and
// only care about the resulting id. `parentFolderId` is optional so
// timetable-ingest's existing root-level uploads are unaffected.
export async function uploadFileToDrive(
  accessToken: string,
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
  parentFolderId?: string | null
): Promise<string> {
  const boundary = "academicos-" + crypto.randomUUID();
  const enc = new TextEncoder();
  const metadata = JSON.stringify(parentFolderId ? { name: filename, parents: [parentFolderId] } : { name: filename });
  const body = new Blob([
    enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`
    ),
    bytes,
    enc.encode(`\r\n--${boundary}--`),
  ]);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!uploadRes.ok) {
    throw new Error(`Drive upload failed: ${await uploadRes.text()}`);
  }
  const { id } = await uploadRes.json();
  return id as string;
}
