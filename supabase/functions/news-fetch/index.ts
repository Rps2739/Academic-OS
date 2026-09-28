// Fetches and normalises RSS/Atom feeds for the News dashboard (design manual
// has no section for this — added 2026-09-07 per user request, see
// memory/project_next_audit_task.md). The fetching/parsing itself lives in
// _shared/news.ts, shared with gd-prep.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { corsHeaders } from "../_shared/cors.ts";
import { FEEDS, type Feed } from "../_shared/feeds.ts";
import { fetchCategory, validateExtraFeed } from "../_shared/news.ts";

const MAX_ITEMS = 60;
const MAX_EXTRA_FEEDS = 10;

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
    const category = String(body?.category ?? "");
    const rawExtra: unknown[] = Array.isArray(body?.extraFeeds) ? body.extraFeeds : [];

    if (!FEEDS[category]) {
      return new Response(JSON.stringify({ error: `Unknown category: ${category}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extraFeedCandidates = await Promise.all(
      rawExtra.slice(0, MAX_EXTRA_FEEDS).map((u) => (typeof u === "string" ? validateExtraFeed(u) : null))
    );
    const extraFeeds = extraFeedCandidates.filter((f): f is Feed => f !== null);

    const { items, failedFeeds } = await fetchCategory(category, extraFeeds);

    return new Response(
      JSON.stringify({ items: items.slice(0, MAX_ITEMS), failedFeeds }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
