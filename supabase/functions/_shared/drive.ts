// Uploads bytes to the app owner's personal Google Drive (drive.file
// scope) and returns the created file's id. Shared by drive-upload
// (browser-initiated attachment uploads) and timetable-ingest (the
// college Gmail watcher), which both need to hand a file to Drive and
// only care about the resulting id.
export async function uploadFileToDrive(
  accessToken: string,
  filename: string,
  mimeType: string,
  bytes: Uint8Array
): Promise<string> {
  const boundary = "academicos-" + crypto.randomUUID();
  const enc = new TextEncoder();
  const metadata = JSON.stringify({ name: filename });
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
