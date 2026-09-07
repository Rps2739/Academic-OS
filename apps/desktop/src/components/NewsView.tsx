import { useEffect, useMemo, useState } from "react";
import {
  Newspaper,
  RefreshCw,
  Star,
  ExternalLink,
  Settings2,
  Plus,
  X as XIcon,
  NotebookPen,
  LineChart,
  Bookmark,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCreateBlockNote } from "@blocknote/react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { supabase } from "../lib/supabase";
import { relativeTime } from "../lib/format";
import { readPref, writePref, readCustomFeeds, writeCustomFeeds } from "../lib/reading-prefs";
import { MarketsPanel } from "./MarketsPanel";
import { ArticleReader, type ReaderArticle } from "./ArticleReader";

interface NewsViewProps {
  localDb: SqliteLocalDb;
  userId: string;
  onChanged: () => void;
  onNotify: (message: string, undo: () => void) => void;
}

interface NewsItem {
  id: string;
  category: string;
  title: string;
  link: string;
  source: string | null;
  summary: string | null;
  published_at: string | null;
  source_count: number;
}

const FEED_CATEGORIES = [
  { id: "ai", label: "AI" },
  { id: "tech", label: "Tech" },
  { id: "business", label: "Business" },
  { id: "finance", label: "Finance" },
  { id: "economics", label: "Economics" },
  { id: "geopolitics", label: "Geopolitics" },
  { id: "india", label: "India" },
] as const;

const INDIA_SUBTABS = [
  { id: "india-national", label: "National" },
  { id: "india-states", label: "States" },
  { id: "india-tn", label: "Tamil Nadu" },
] as const;

type TabId = (typeof FEED_CATEGORIES)[number]["id"] | "saved" | "markets";

const STALE_MS = 30 * 60 * 1000; // 30 minutes

/** Sources with a known metered/soft paywall. Their headlines are fine to
 * show (that's what RSS is for — outlets publish those openly), but the
 * in-app reader does a plain server-side fetch with no cookies or session,
 * which can sometimes pull full text past a soft meter that a real browser
 * visit would have blocked. For these, skip extraction entirely and always
 * open the real page instead, so the site's own paywall applies exactly as
 * the publisher intends. See feeds.ts for the matching `source` strings —
 * keep this list in sync if a feed's source name changes there.
 * Deliberately NOT applied to headline display, bookmarking, or "Save to
 * note" — only to whether clicking an article opens the reader panel. */
const NO_READER_SOURCES = new Set([
  "Mint",
  "Mint Markets",
  "Mint Economy",
  "Business Standard",
  "BusinessLine",
  "BusinessLine Portfolio",
  "BusinessLine Economy",
  "Wired",
  "MIT Technology Review",
  "Foreign Policy",
]);

/** Feed content is untrusted input from the public internet — never hand a
 * raw feed-supplied link straight to the OS. Only http(s) links are opened. */
function safeExternalUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function NewsView({ localDb, userId, onChanged, onNotify }: NewsViewProps) {
  const [tab, setTab] = useState<TabId>(() => {
    const saved = readPref<TabId>("newsTab", "ai");
    return FEED_CATEGORIES.some((c) => c.id === saved) || saved === "saved" || saved === "markets"
      ? saved
      : "ai";
  });
  const [indiaSub, setIndiaSub] = useState<(typeof INDIA_SUBTABS)[number]["id"]>("india-national");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failedFeeds, setFailedFeeds] = useState<string[]>([]);
  const [savedLinks, setSavedLinks] = useState<Set<string>>(new Set());
  const [savedRows, setSavedRows] = useState<LocalRow[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [customFeeds, setCustomFeeds] = useState<Record<string, string[]>>(() => readCustomFeeds());
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [readerArticle, setReaderArticle] = useState<ReaderArticle | null>(null);
  // Never rendered — used only for its markdown-to-blocks conversion, so
  // "Save to note" produces real BlockNote blocks rather than hand-crafted
  // JSON that could drift from the library's actual schema.
  const markdownEditor = useCreateBlockNote();

  const activeCategory = tab === "india" ? indiaSub : tab;

  useEffect(() => {
    writePref("newsTab", tab);
  }, [tab]);

  // Load saved-article link set once (for star state) and whenever the Saved
  // tab is opened, so a bookmark added elsewhere still shows filled here.
  async function loadSaved() {
    const rows = await localDb.raw.select<Record<string, unknown>[]>(
      "SELECT * FROM saved_articles WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC",
      [userId]
    );
    setSavedRows(rows as unknown as LocalRow[]);
    setSavedLinks(new Set(rows.map((r) => r["link"] as string)));
  }

  useEffect(() => {
    void loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    setReaderArticle(null);
    if (tab === "saved" || tab === "markets") return;
    void loadCategory(activeCategory, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, tab]);

  // Keeps the tab you're actively viewing current without needing a manual
  // refresh or a tab switch — loadCategory itself only actually re-fetches
  // once STALE_MS has genuinely passed, so this just re-checks on the same
  // cadence rather than forcing a fetch every tick.
  useEffect(() => {
    if (tab === "saved" || tab === "markets") return;
    const interval = setInterval(() => void loadCategory(activeCategory, false), STALE_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, tab]);

  async function loadCategory(category: string, forceRefresh: boolean) {
    setLoading(true);
    setFailedFeeds([]);
    try {
      // Cached rows are ranked the same way the server ranks a fresh fetch —
      // by cross-source corroboration first, recency second — so switching
      // tabs doesn't visibly re-order once a background refresh completes.
      const cached = await localDb.raw.select<Record<string, unknown>[]>(
        "SELECT * FROM news_items_local WHERE category = $1 ORDER BY source_count DESC, published_at DESC",
        [category]
      );
      setItems(cached as unknown as NewsItem[]);

      const newestFetch = cached[0]?.["fetched_at"] as string | undefined;
      const isStale = !newestFetch || Date.now() - new Date(newestFetch).getTime() > STALE_MS;

      if (!forceRefresh && !isStale) {
        setLoading(false);
        return;
      }

      const extraFeeds = customFeeds[category] ?? [];
      const { data, error } = await supabase.functions.invoke("news-fetch", {
        body: { category, extraFeeds },
      });
      if (error) throw error;

      interface RawNewsItem {
        id: string;
        title: string;
        link: string;
        source: string;
        summary: string;
        publishedAt: string;
        sourceCount: number;
      }
      const freshItems = (data?.items ?? []) as RawNewsItem[];
      setFailedFeeds((data?.failedFeeds ?? []) as string[]);

      // Server already validates link scheme, but a defence-in-depth check
      // here means a future server bug can never surface a bad link in the UI.
      const safeItems = freshItems.filter((it) => safeExternalUrl(it.link) !== null);

      const now = new Date().toISOString();
      await localDb.raw.execute("DELETE FROM news_items_local WHERE category = $1", [category]);
      for (const it of safeItems) {
        await localDb.raw.execute(
          `INSERT INTO news_items_local (id, category, title, link, source, summary, published_at, fetched_at, source_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT(id) DO UPDATE SET category=$2, title=$3, link=$4, source=$5, summary=$6, published_at=$7, fetched_at=$8, source_count=$9`,
          [it.id, category, it.title, it.link, it.source, it.summary, it.publishedAt, now, it.sourceCount]
        );
      }
      setItems(
        safeItems.map((it) => ({
          id: it.id,
          category,
          title: it.title,
          link: it.link,
          source: it.source,
          summary: it.summary,
          published_at: it.publishedAt,
          source_count: it.sourceCount,
        }))
      );
    } catch (err) {
      console.error("news-fetch failed:", err);
      if (items.length === 0) {
        onNotify(
          err instanceof Error ? `Couldn't load news: ${err.message}` : "Couldn't load news.",
          () => {}
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleBookmark(item: NewsItem) {
    if (savedLinks.has(item.link)) {
      const row = savedRows.find((r) => r["link"] === item.link);
      if (!row) return;
      const id = row.id as string;
      await localDb.put("saved_articles", { id, user_id: userId, deleted_at: new Date().toISOString() });
      await loadSaved();
      onChanged();
      onNotify("Removed bookmark", async () => {
        await localDb.put("saved_articles", { id, user_id: userId, deleted_at: null });
        await loadSaved();
        onChanged();
      });
    } else {
      const id = crypto.randomUUID();
      await localDb.put("saved_articles", {
        id,
        user_id: userId,
        title: item.title,
        link: item.link,
        source: item.source,
        summary: item.summary,
        category: item.category,
        published_at: item.published_at,
      });
      await loadSaved();
      onChanged();
    }
  }

  async function removeSaved(row: LocalRow) {
    const id = row.id as string;
    await localDb.put("saved_articles", { id, user_id: userId, deleted_at: new Date().toISOString() });
    await loadSaved();
    onChanged();
    onNotify("Removed bookmark", async () => {
      await localDb.put("saved_articles", { id, user_id: userId, deleted_at: null });
      await loadSaved();
      onChanged();
    });
  }

  async function saveToNote(item: NewsItem) {
    const folderId = await localDb.findOrCreateFolderPath(userId, ["SIBM", "Current Affairs"]);
    const pageId = crypto.randomUUID();
    await localDb.put("nodes", {
      id: pageId,
      user_id: userId,
      parent_id: folderId,
      kind: "page",
      title: item.title,
      sort_order: Date.now(),
    });
    const bodyMd = `# ${item.title}\n\n**Source:** ${item.source ?? "Unknown"}  \n**Link:** ${item.link}  \n**Date:** ${item.published_at ? new Date(item.published_at).toLocaleString() : "Unknown"}\n\n${item.summary ?? ""}\n`;
    const blocks = await markdownEditor.tryParseMarkdownToBlocks(bodyMd);
    await localDb.put("page_bodies", {
      id: pageId,
      user_id: userId,
      blocks,
      markdown: bodyMd,
      plaintext: `${item.title} ${item.summary ?? ""}`,
    });
    onChanged();
    onNotify("Saved to SIBM / Current Affairs", () => {});
  }

  function addCustomFeed() {
    const url = newFeedUrl.trim();
    if (!url) return;
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("invalid");
    } catch {
      onNotify("That doesn't look like a valid feed URL.", () => {});
      return;
    }
    const next = { ...customFeeds, [activeCategory]: [...(customFeeds[activeCategory] ?? []), url] };
    setCustomFeeds(next);
    writeCustomFeeds(next);
    setNewFeedUrl("");
  }

  function removeCustomFeed(category: string, url: string) {
    const next = { ...customFeeds, [category]: (customFeeds[category] ?? []).filter((u) => u !== url) };
    setCustomFeeds(next);
    writeCustomFeeds(next);
  }

  /** Opens the reader panel — unless the source is a known metered-paywall
   * outlet (see NO_READER_SOURCES), in which case it goes straight to the
   * real page instead, so that outlet's own paywall applies normally. */
  function openArticle(item: NewsItem | { title: string; link: string; source: string | null; published_at: string | null }) {
    if (item.source && NO_READER_SOURCES.has(item.source)) {
      const safe = safeExternalUrl(item.link);
      if (safe) void openUrl(safe);
      return;
    }
    setReaderArticle({
      title: item.title,
      link: item.link,
      source: item.source,
      published_at: item.published_at,
    });
  }

  const savedItems = useMemo(
    () =>
      savedRows.map(
        (r) =>
          ({
            id: r.id as string,
            category: (r["category"] as string) ?? "",
            title: r["title"] as string,
            link: r["link"] as string,
            source: r["source"] as string | null,
            summary: r["summary"] as string | null,
            published_at: r["published_at"] as string | null,
            source_count: 0, // not shown for saved items — no ranking needed on a list you chose yourself
          }) satisfies NewsItem
      ),
    [savedRows]
  );

  function ArticleRow({ item, saved }: { item: NewsItem; saved: boolean }) {
    return (
      <div className={`news-item ${readerArticle?.link === item.link ? "news-item--open" : ""}`}>
        <button className="news-item__body" onClick={() => openArticle(item)}>
          <div className="news-item__title-row">
            <div className="news-item__title">{item.title}</div>
            {item.source_count > 1 && (
              <span className="news-item__corroboration" title={`${item.source_count} outlets are covering this story`}>
                {item.source_count} sources
              </span>
            )}
          </div>
          <div className="news-item__meta">
            {item.source ?? "Unknown source"}
            {item.published_at ? ` · ${relativeTime(item.published_at)}` : ""}
          </div>
          {item.summary && <div className="news-item__summary">{item.summary}</div>}
        </button>
        <div className="news-item__actions">
          <button
            className={`icon-btn ${saved ? "icon-btn--active" : ""}`}
            title={saved ? "Remove bookmark" : "Bookmark"}
            onClick={() => void toggleBookmark(item)}
          >
            <Star size={14} strokeWidth={2} fill={saved ? "currentColor" : "none"} />
          </button>
          <button
            className="icon-btn"
            title="Save to note"
            onClick={() => void saveToNote(item)}
          >
            <NotebookPen size={14} strokeWidth={2} />
          </button>
          <button
            className="icon-btn"
            title="Open link"
            onClick={() => {
              const safe = safeExternalUrl(item.link);
              if (safe) void openUrl(safe);
            }}
          >
            <ExternalLink size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="news-view">
      <div className="news-view__head">
        <h2 className="news-view__heading">
          <Newspaper size={18} strokeWidth={2} /> News
        </h2>
        <div className="news-view__head-actions">
          {tab !== "saved" && tab !== "markets" && (
            <button className="btn btn--ghost btn--sm" onClick={() => setManageOpen((v) => !v)}>
              <Settings2 size={13} strokeWidth={2} /> Sources
            </button>
          )}
          {tab !== "saved" && tab !== "markets" && (
            <button
              className="btn btn--ghost btn--sm"
              disabled={loading}
              onClick={() => void loadCategory(activeCategory, true)}
            >
              <RefreshCw size={13} strokeWidth={2} className={loading ? "spin" : ""} /> Refresh
            </button>
          )}
        </div>
      </div>

      <div className="news-view__tabs">
        {FEED_CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`news-view__tab ${tab === c.id ? "news-view__tab--active" : ""}`}
            onClick={() => setTab(c.id)}
          >
            {c.label}
          </button>
        ))}
        <button
          className={`news-view__tab ${tab === "saved" ? "news-view__tab--active" : ""}`}
          onClick={() => setTab("saved")}
        >
          <Bookmark size={12} strokeWidth={2} /> Saved
        </button>
        <button
          className={`news-view__tab ${tab === "markets" ? "news-view__tab--active" : ""}`}
          onClick={() => setTab("markets")}
        >
          <LineChart size={12} strokeWidth={2} /> Markets
        </button>
      </div>

      {tab === "india" && (
        <div className="news-view__subtabs">
          {INDIA_SUBTABS.map((s) => (
            <button
              key={s.id}
              className={`news-view__subtab ${indiaSub === s.id ? "news-view__subtab--active" : ""}`}
              onClick={() => setIndiaSub(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {manageOpen && tab !== "saved" && tab !== "markets" && (
        <div className="news-view__manage">
          <p className="news-view__manage-hint">
            Add your own RSS/Atom feed URL for <strong>{activeCategory}</strong>:
          </p>
          <div className="news-view__manage-row">
            <input
              className="news-view__manage-input"
              placeholder="https://example.com/feed.xml"
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomFeed()}
            />
            <button className="btn btn--primary btn--sm" onClick={addCustomFeed}>
              <Plus size={13} strokeWidth={2} /> Add
            </button>
          </div>
          {(customFeeds[activeCategory] ?? []).map((url) => (
            <div key={url} className="news-view__manage-item">
              <span>{url}</span>
              <button className="icon-btn" onClick={() => removeCustomFeed(activeCategory, url)}>
                <XIcon size={13} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {failedFeeds.length > 0 && (
        <div className="news-view__notice">
          {failedFeeds.length} source{failedFeeds.length > 1 ? "s" : ""} unavailable right now.
        </div>
      )}

      {tab === "markets" ? (
        <MarketsPanel localDb={localDb} userId={userId} onNotify={onNotify} />
      ) : (
        <div className={`news-view__layout ${readerArticle ? "news-view__layout--split" : ""}`}>
          {tab === "saved" ? (
            <div className="news-list">
              {savedItems.length === 0 ? (
                <div className="news-view__empty">No bookmarks yet. Star an article to save it here.</div>
              ) : (
                savedItems.map((item) => {
                  const row = savedRows.find((r) => r.id === item.id);
                  return (
                    <div
                      className={`news-item ${readerArticle?.link === item.link ? "news-item--open" : ""}`}
                      key={item.id}
                    >
                      <button className="news-item__body" onClick={() => openArticle(item)}>
                        <div className="news-item__title">{item.title}</div>
                        <div className="news-item__meta">
                          {item.source ?? "Unknown source"}
                          {item.published_at ? ` · ${relativeTime(item.published_at)}` : ""}
                        </div>
                        {item.summary && <div className="news-item__summary">{item.summary}</div>}
                      </button>
                      <div className="news-item__actions">
                        <button
                          className="icon-btn"
                          title="Open link"
                          onClick={() => {
                            const safe = safeExternalUrl(item.link);
                            if (safe) void openUrl(safe);
                          }}
                        >
                          <ExternalLink size={14} strokeWidth={2} />
                        </button>
                        <button
                          className="icon-btn"
                          title="Remove bookmark"
                          onClick={() => row && void removeSaved(row)}
                        >
                          <XIcon size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="news-list">
              {loading && items.length === 0 ? (
                <div className="news-view__empty">
                  <span className="spinner" aria-hidden /> Loading…
                </div>
              ) : items.length === 0 ? (
                <div className="news-view__empty">No articles right now. Try refreshing.</div>
              ) : (
                items.map((item) => <ArticleRow key={item.id} item={item} saved={savedLinks.has(item.link)} />)
              )}
            </div>
          )}
          {readerArticle && <ArticleReader article={readerArticle} onClose={() => setReaderArticle(null)} />}
        </div>
      )}
    </div>
  );
}
