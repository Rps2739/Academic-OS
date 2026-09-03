// Uploads a file to the app owner's personal Google Drive (drive.file
// scope — the app can only see files it created itself) and returns the
// Drive file id. The client never talks to Google directly; it sends the
// bytes here over its authenticated Supabase session, and this function
// holds the only Google credentials that exist anywhere (see
// _shared/google-drive.ts). Requires a valid Supabase session — Edge
// Functions verify the JWT before this code runs.
import { getDriveAccessToken } from "../_shared/google-drive.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const filename = form.get("filename");
    if (!(file instanceof File) || typeof filename !== "string" || !filename) {
      return new Response(JSON.stringify({ error: "file and filename are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getDriveAccessToken();

    const boundary = "academicos-" + crypto.randomUUID();
    const enc = new TextEncoder();
    const metadata = JSON.stringify({ name: filename });
    const body = new Blob([
      enc.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`
      ),
      new Uint8Array(await file.arrayBuffer()),
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
      return new Response(
        JSON.stringify({ error: `Drive upload failed: ${await uploadRes.text()}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { id } = await uploadRes.json();
    return new Response(JSON.stringify({ driveFileId: id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
