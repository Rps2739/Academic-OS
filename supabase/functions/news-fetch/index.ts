// Fetches and normalises RSS/Atom feeds for the News dashboard (design manual
// has no section for this — added 2026-09-07 per user request, see
// memory/project_next_audit_task.md). One dead feed must never fail the whole
// category: every feed fetch is isolated with Promise.allSettled.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.0";
import { corsHeaders } from "../_shared/cors.ts";
import { FEEDS, type Feed } from "./feeds.ts";

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  summary: string;
  publishedAt: string;
  category: string;
}

const MAX_ITEMS = 60;
const MAX_EXTRA_FEEDS = 10;
const FEED_TIMEOUT_MS = 8000;
const SUMMARY_MAX_CHARS = 280;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

/** Not a sanitiser — a formatting convenience. Titles/summaries are always
 * rendered as plain text via normal JSX interpolation on the client, never
 * dangerouslySetInnerHTML. */
function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

/** djb2 — short, stable, synchronous. crypto.subtle is async and overkill here. */
function hashId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function toArray<T>(x: T | T[] | undefined): T[] {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

/** Only http(s) links are ever surfaced to the client or opened via the OS —
 * a compromised or hostile feed could otherwise supply javascript:/file:/data:. */
function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function parseDate(raw: unknown): string {
  if (typeof raw === "string") {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/** Extracts an Atom entry's link — `link` can be a single {@_href} object or
 * an array of them with different `rel` values (alternate/self/etc). */
function atomLink(entry: Record<string, unknown>): string | null {
  const link = entry["link"];
  const links = toArray(link as Record<string, unknown> | Record<string, unknown>[]);
  const alt = links.find((l) => (l as Record<string, unknown>)["@_rel"] === "alternate") ?? links[0];
  if (!alt) return null;
  const href = (alt as Record<string, unknown>)["@_href"] ?? (typeof alt === "string" ? alt : null);
  return safeUrl(href);
}

function extractText(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && "#text" in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

function parseFeed(xml: string, feed: Feed, category: string): NewsItem[] {
  const doc = parser.parse(xml);
  const items: NewsItem[] = [];

  if (doc?.rss?.channel) {
    // RSS 2.0
    const channel = Array.isArray(doc.rss.channel) ? doc.rss.channel[0] : doc.rss.channel;
    for (const item of toArray<Record<string, unknown>>(channel?.item)) {
      const link = safeUrl(item["link"]);
      const title = stripHtml(extractText(item["title"]) ?? "");
      if (!link || !title) continue;
      const body = extractText(item["description"]) || extractText(item["content:encoded"]) || "";
      items.push({
        id: hashId(link),
        title,
        link,
        source: feed.source,
        summary: stripHtml(body).slice(0, SUMMARY_MAX_CHARS),
        publishedAt: parseDate(item["pubDate"]),
        category,
      });
    }
  } else if (doc?.feed?.entry) {
    // Atom
    for (const entry of toArray<Record<string, unknown>>(doc.feed.entry)) {
      const link = atomLink(entry);
      const title = stripHtml(extractText(entry["title"]) ?? "");
      if (!link || !title) continue;
      const body = extractText(entry["summary"]) || extractText(entry["content"]) || "";
      items.push({
        id: hashId(link),
        title,
        link,
        source: feed.source,
        summary: stripHtml(body).slice(0, SUMMARY_MAX_CHARS),
        publishedAt: parseDate(entry["published"] ?? entry["updated"]),
        category,
      });
    }
  }

  return items;
}

async function fetchFeed(feed: Feed, category: string): Promise<NewsItem[]> {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 AcademicOS/1.0",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseFeed(xml, feed, category);
}

/** Blocks user-supplied feed URLs from targeting internal/private network
 * ranges — this endpoint fetches server-side on the caller's behalf and must
 * never become an open SSRF proxy, even though the caller is a single user. */
function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function validateExtraFeed(url: string): Feed | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isPrivateOrLocalHost(u.hostname)) return null;
    return { url: u.toString(), source: u.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

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

    const baseFeeds = FEEDS[category];
    if (!baseFeeds) {
      return new Response(JSON.stringify({ error: `Unknown category: ${category}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extraFeeds = rawExtra
      .slice(0, MAX_EXTRA_FEEDS)
      .map((u) => (typeof u === "string" ? validateExtraFeed(u) : null))
      .filter((f): f is Feed => f !== null);

    const allFeeds = [...baseFeeds, ...extraFeeds];

    const results = await Promise.allSettled(allFeeds.map((f) => fetchFeed(f, category)));

    const items: NewsItem[] = [];
    const failedFeeds: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        items.push(...r.value);
      } else {
        failedFeeds.push(allFeeds[i].source);
      }
    });

    // Dedupe: by link first, then by a normalised title (Indian outlets
    // frequently syndicate identical PTI/ANI copy under slightly different headlines).
    const seenLinks = new Set<string>();
    const seenTitles = new Set<string>();
    const deduped: NewsItem[] = [];
    for (const item of items) {
      const normTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seenLinks.has(item.link) || seenTitles.has(normTitle)) continue;
      seenLinks.add(item.link);
      seenTitles.add(normTitle);
      deduped.push(item);
    }

    deduped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return new Response(
      JSON.stringify({ items: deduped.slice(0, MAX_ITEMS), failedFeeds }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
