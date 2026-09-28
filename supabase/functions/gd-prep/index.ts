// GD Prep (see docs/superpowers/specs/2026-09-26-gd-prep-design.md).
// Called every 3 hours by the desktop app (mode "scan") and when the user adds an
// article by hand (mode "note"). Authenticated with the caller's session
// JWT like news-fetch — deploy WITHOUT --no-verify-jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchCategory } from "../_shared/news.ts";
import { generateJson, GeminiRateLimitError } from "../_shared/gemini.ts";
import {
  buildNotePrompt,
  buildScanPrompt,
  mapScanPicks,
  NOTE_SCHEMA,
  SCAN_CATEGORIES,
  SCAN_SCHEMA,
  selectCandidates,
  validateNote,
} from "../_shared/gd-prep-core.ts";

const MAX_SEEN_IDS = 5000;
const MAX_RECENT_PICKS = 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stringList(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .slice(0, maxItems)
    .map((s) => s.slice(0, maxLen));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) throw new Error("Not authenticated");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const body = await req.json().catch(() => ({}));

    if (body?.mode === "note") {
      const item = body.item ?? {};
      const title = typeof item.title === "string" ? item.title.trim().slice(0, 300) : "";
      if (!title) return json({ error: "Missing item title" }, 400);
      const summary = typeof item.summary === "string" ? item.summary.slice(0, 600) : "";
      const source = typeof item.source === "string" ? item.source.slice(0, 100) : "";
      try {
        const note = validateNote(await generateJson(buildNotePrompt({ title, summary, source }), NOTE_SCHEMA, apiKey));
        if (!note) return json({ error: "The AI's answer was incomplete" }, 502);
        return json({ note });
      } catch (err) {
        if (err instanceof GeminiRateLimitError) return json({ rateLimited: true });
        throw err;
      }
    }

    if (body?.mode === "scan") {
      const seenIds = new Set(stringList(body.seenIds, MAX_SEEN_IDS, 64));
      const recentPicks = stringList(body.recentPicks, MAX_RECENT_PICKS, 200);

      const results = await Promise.all(SCAN_CATEGORIES.map((c) => fetchCategory(c)));
      const candidates = selectCandidates(results.flatMap((r) => r.items), seenIds, Date.now());
      // Nothing new since the last run: don't spend a Gemini call.
      if (candidates.length === 0) return json({ picks: [], scannedIds: [], geminiCalled: false });

      let raw: unknown;
      try {
        raw = await generateJson(buildScanPrompt(candidates, recentPicks), SCAN_SCHEMA, apiKey);
      } catch (err) {
        // Not marking anything seen, so the next run reconsiders these.
        if (err instanceof GeminiRateLimitError) {
          return json({ rateLimited: true, picks: [], scannedIds: [], geminiCalled: true });
        }
        throw err;
      }

      const picks = mapScanPicks(raw, candidates).map(({ item, note }) => ({
        item: {
          id: item.id,
          title: item.title,
          link: item.link,
          source: item.source,
          summary: item.summary,
          publishedAt: item.publishedAt,
        },
        note,
      }));
      return json({ picks, scannedIds: candidates.map((c) => c.id), geminiCalled: true });
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
