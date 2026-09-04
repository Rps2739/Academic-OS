// Uploads a file to the app owner's personal Google Drive (drive.file
// scope — the app can only see files it created itself) and returns the
// Drive file id. The client never talks to Google directly; it sends the
// bytes here over its authenticated Supabase session, and this function
// holds the only Google credentials that exist anywhere (see
// _shared/google-oauth.ts). Requires a valid Supabase session — Edge
// Functions verify the JWT before this code runs.
import { getGoogleAccessToken } from "../_shared/google-oauth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { uploadFileToDrive } from "../_shared/drive.ts";

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

    const accessToken = await getGoogleAccessToken();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const driveFileId = await uploadFileToDrive(accessToken, filename, file.type, bytes);

    return new Response(JSON.stringify({ driveFileId }), {
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
