// Streams a file back from the app owner's personal Google Drive by id.
// Same rationale as drive-upload: the client only ever talks to this
// function, never to Google, and never sees a Google credential.
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
    const { driveFileId } = await req.json();
    if (typeof driveFileId !== "string" || !driveFileId) {
      return new Response(JSON.stringify({ error: "driveFileId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getDriveAccessToken();

    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!fileRes.ok) {
      return new Response(
        JSON.stringify({ error: `Drive fetch failed: ${await fileRes.text()}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mime = fileRes.headers.get("Content-Type") ?? "application/octet-stream";
    return new Response(fileRes.body, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": mime },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
