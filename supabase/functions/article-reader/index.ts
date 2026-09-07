// Server-side "reader mode" for the News side panel — fetches an article
// URL, extracts its readable content, and returns it as plain structured
// text blocks (never raw HTML) for the desktop app to render in-app instead
// of opening the system browser. Added 2026-09-07 per user request; see
// memory/project_next_audit_task.md.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { corsHeaders } from "../_shared/cors.ts";
import { validateExternalUrl } from "../_shared/url-safety.ts";
import { extractArticle } from "./extract.ts";

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

    const body = await req.json().catch(() => ({}));
    const rawUrl = String(body?.url ?? "");
    const url = await validateExternalUrl(rawUrl);
    if (!url) {
      return new Response(JSON.stringify({ error: "Invalid or disallowed URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const article = await extractArticle(url);
    if (!article) {
      // Not a server error — plenty of pages (paywalls, heavy JS rendering,
      // unusual markup) just aren't extractable. The client falls back to
      // "open in browser" for these.
      return new Response(JSON.stringify({ article: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ article }), {
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
