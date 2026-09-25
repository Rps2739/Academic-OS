// Periodic two-way Calendar sync, called by the desktop app's sync loop
// every 2 minutes while it's running (design manual §4.6-§4.8): pulls
// events the user adds/edits/deletes in the app's own "Academic OS —
// Classes" Google Calendar into class_sessions, and pushes the app's own
// creates/edits/deletes back (see _shared/calendar.ts). The automated
// ingest path (timetable-ingest) also calls syncClassSessionsToCalendar
// directly after creating sessions, so Calendar stays current even when
// the desktop app isn't open.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { corsHeaders } from "../_shared/cors.ts";
import { getGoogleAccessToken } from "../_shared/google-oauth.ts";
import { syncClassSessionsToCalendar } from "../_shared/calendar.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) throw new Error("Not authenticated");

    const accessToken = await getGoogleAccessToken();
    const result = await syncClassSessionsToCalendar(supabase, user.id, accessToken);

    return new Response(JSON.stringify({ status: "ok", ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
