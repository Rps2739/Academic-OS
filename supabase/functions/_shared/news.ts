// RSS/Atom fetching, parsing, corroboration ranking and dedup, shared by
// news-fetch (one category for the News tabs) and gd-prep (every category
// for the scheduled GD Prep scan). Moved out of news-fetch/index.ts unchanged.
// One dead feed must never fail a whole category: every feed fetch is
// isolated with Promise.allSettled.
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.0";
import { validateExternalUrl, safeFetch } from "./url-safety.ts";
import { FEEDS, type Feed } from "./feeds.ts";

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  summary: string;
  publishedAt: string;
  category: string;
  /** How many distinct curated sources are running essentially the same
   * story. Plain RSS carries no view/share/engagement data, so this — cross-
   * outlet corroboration — is the only honest "how big is this story"
   * signal available. Used to rank within a category; not a virality metric. */
  sourceCount: number;
}

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
        sourceCount: 1, // filled in for real once corroboration across feeds is known, below
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
        sourceCount: 1, // filled in for real once corroboration across feeds is known, below
        category,
      });
    }
  }

  return items;
}

async function fetchFeed(feed: Feed, category: string): Promise<NewsItem[]> {
  // safeFetch re-validates every redirect hop — this handles both the
  // curated feed list and user-supplied extraFeeds identically, since a
  // redirect-bypass doesn't care which list a URL came from.
  const res = await safeFetch(feed.url, {
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

export async function validateExtraFeed(url: string): Promise<Feed | null> {
  const safe = await validateExternalUrl(url);
  if (!safe) return null;
  const hostname = new URL(safe).hostname;
  return { url: safe, source: hostname.replace(/^www\./, "") };
}

/** Fetches every feed for a category (plus any validated extra feeds),
 * then ranks and dedupes. Not sliced — callers cap as they need. */
export async function fetchCategory(
  category: string,
  extraFeeds: Feed[] = []
): Promise<{ items: NewsItem[]; failedFeeds: string[] }> {
  const allFeeds = [...(FEEDS[category] ?? []), ...extraFeeds];
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

  // Corroboration: how many DISTINCT outlets ran essentially the same
  // story. Plain RSS has no view/share/engagement numbers, so this is the
  // only honest "how big is this story" signal available — not a
  // virality metric, just cross-source agreement.
  const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const sourcesByTitle = new Map<string, Set<string>>();
  for (const item of items) {
    const key = normTitle(item.title);
    if (!sourcesByTitle.has(key)) sourcesByTitle.set(key, new Set());
    sourcesByTitle.get(key)!.add(item.source);
  }

  // Dedupe: by link first, then by a normalised title (Indian outlets
  // frequently syndicate identical PTI/ANI copy under slightly different headlines).
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const item of items) {
    const key = normTitle(item.title);
    if (seenLinks.has(item.link) || seenTitles.has(key)) continue;
    seenLinks.add(item.link);
    seenTitles.add(key);
    deduped.push({ ...item, sourceCount: sourcesByTitle.get(key)?.size ?? 1 });
  }

  // Rank by corroboration first (a story several outlets are covering
  // outranks a single outlet's one-off piece), recency as the tiebreaker.
  deduped.sort((a, b) => {
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  return { items: deduped, failedFeeds };
}
