import { useEffect, useState } from "react";
import { Plus, X as XIcon, TrendingUp, TrendingDown, Search } from "lucide-react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { supabase } from "../lib/supabase";
import { CandlestickChart, type Candle } from "./CandlestickChart";

interface MarketsPanelProps {
  localDb: SqliteLocalDb;
  userId: string;
  onNotify: (message: string, undo: () => void) => void;
}

interface Quote {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  changePercent: number | null;
  currency: string | null;
}

interface MfSearchResult {
  schemeCode: number;
  schemeName: string;
}

const INDICES = [
  { symbol: "^NSEI", label: "Nifty 50" },
  { symbol: "^BSESN", label: "Sensex" },
];

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="markets-change markets-change--flat">—</span>;
  const up = pct >= 0;
  return (
    <span className={`markets-change ${up ? "markets-change--up" : "markets-change--down"}`}>
      {up ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />}
      {up ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

/** Simple NAV trend line — reuses the same linear-scale approach as the
 * candlestick chart, just drawn as a polyline instead of OHLC bodies. */
function NavTrendLine({ nav }: { nav: Array<{ date: string; nav: number }> }) {
  if (nav.length === 0) return <div className="candlestick-chart__empty">No NAV history available.</div>;
  const values = nav.map((n) => n.nav);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.05 || 1;
  const yMin = min - pad;
  const yMax = max + pad;
  const W = 600;
  const H = 140;
  const scaleX = (i: number) => (i / (nav.length - 1 || 1)) * W;
  const scaleY = (v: number) => H - ((v - yMin) / (yMax - yMin)) * H;
  const points = nav.map((n, i) => `${scaleX(i)},${scaleY(n.nav)}`).join(" ");
  const last = nav[nav.length - 1];
  const first = nav[0];
  const up = last.nav >= first.nav;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="candlestick-chart__svg" style={{ height: H }}>
      <polyline points={points} className={up ? "candlestick-chart__up" : "candlestick-chart__down"} fill="none" strokeWidth={2} />
    </svg>
  );
}

export function MarketsPanel({ localDb, userId, onNotify }: MarketsPanelProps) {
  const [indexQuotes, setIndexQuotes] = useState<Record<string, Quote>>({});
  const [watchlist, setWatchlist] = useState<LocalRow[]>([]);
  const [watchlistQuotes, setWatchlistQuotes] = useState<Record<string, Quote>>({});
  const [trending, setTrending] = useState<string[]>([]);
  const [trendingQuotes, setTrendingQuotes] = useState<Record<string, Quote>>({});
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [mfQuery, setMfQuery] = useState("");
  const [mfResults, setMfResults] = useState<MfSearchResult[]>([]);
  const [expandedMf, setExpandedMf] = useState<string | null>(null);
  const [mfNav, setMfNav] = useState<Array<{ date: string; nav: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  async function loadWatchlist() {
    const rows = await localDb.raw.select<Record<string, unknown>[]>(
      "SELECT * FROM watchlist_items WHERE user_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC",
      [userId]
    );
    setWatchlist(rows as unknown as LocalRow[]);
    return rows as unknown as LocalRow[];
  }

  async function refreshAll() {
    setLoading(true);
    setUnavailable(false);
    try {
      const list = await loadWatchlist();
      const stockSymbols = [...INDICES.map((i) => i.symbol), ...list.filter((w) => w["kind"] === "stock").map((w) => w["symbol"] as string)];

      if (stockSymbols.length > 0) {
        const { data, error } = await supabase.functions.invoke("markets-fetch", {
          body: { type: "quotes", symbols: stockSymbols },
        });
        if (error) throw error;
        const quotes = (data?.result ?? []) as Quote[];
        const byIdx: Record<string, Quote> = {};
        const byWatch: Record<string, Quote> = {};
        quotes.forEach((q) => {
          if (INDICES.some((i) => i.symbol === q.symbol)) byIdx[q.symbol] = q;
          else byWatch[q.symbol] = q;
        });
        setIndexQuotes(byIdx);
        setWatchlistQuotes(byWatch);
      }

      const { data: trendData, error: trendErr } = await supabase.functions.invoke("markets-fetch", {
        body: { type: "trending" },
      });
      if (!trendErr) {
        const symbols = ((trendData?.result ?? []) as string[]).slice(0, 8);
        setTrending(symbols);
        if (symbols.length > 0) {
          const { data: tq } = await supabase.functions.invoke("markets-fetch", {
            body: { type: "quotes", symbols },
          });
          const byTrend: Record<string, Quote> = {};
          ((tq?.result ?? []) as Quote[]).forEach((q) => (byTrend[q.symbol] = q));
          setTrendingQuotes(byTrend);
        }
      }
    } catch (err) {
      console.error("markets-fetch failed:", err);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addToWatchlist(symbol: string, kind: "stock" | "mf", displayName?: string, schemeCode?: string) {
    const id = crypto.randomUUID();
    await localDb.put("watchlist_items", {
      id,
      user_id: userId,
      symbol,
      kind,
      display_name: displayName ?? null,
      scheme_code: schemeCode ?? null,
      sort_order: Date.now(),
    });
    await loadWatchlist();
    void refreshAll();
  }

  async function removeFromWatchlist(row: LocalRow) {
    const id = row.id as string;
    await localDb.put("watchlist_items", { id, user_id: userId, deleted_at: new Date().toISOString() });
    await loadWatchlist();
    onNotify("Removed from watchlist", async () => {
      await localDb.put("watchlist_items", { id, user_id: userId, deleted_at: null });
      await loadWatchlist();
    });
  }

  async function toggleExpand(symbol: string) {
    if (expandedSymbol === symbol) {
      setExpandedSymbol(null);
      return;
    }
    setExpandedSymbol(symbol);
    setCandlesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("markets-fetch", {
        body: { type: "candles", symbol },
      });
      if (error) throw error;
      setCandles((data?.result ?? []) as Candle[]);
    } catch (err) {
      console.error("candles fetch failed:", err);
      setCandles([]);
    } finally {
      setCandlesLoading(false);
    }
  }

  async function searchMf() {
    if (!mfQuery.trim()) return;
    try {
      const { data, error } = await supabase.functions.invoke("markets-fetch", {
        body: { type: "mf-search", query: mfQuery.trim() },
      });
      if (error) throw error;
      setMfResults((data?.result ?? []) as MfSearchResult[]);
    } catch (err) {
      console.error("mf-search failed:", err);
      setMfResults([]);
    }
  }

  async function toggleExpandMf(schemeCode: string) {
    if (expandedMf === schemeCode) {
      setExpandedMf(null);
      return;
    }
    setExpandedMf(schemeCode);
    try {
      const { data, error } = await supabase.functions.invoke("markets-fetch", {
        body: { type: "mf-nav", schemeCode },
      });
      if (error) throw error;
      setMfNav((data?.result?.nav ?? []) as Array<{ date: string; nav: number }>);
    } catch (err) {
      console.error("mf-nav fetch failed:", err);
      setMfNav([]);
    }
  }

  const stockWatchlist = watchlist.filter((w) => w["kind"] === "stock");
  const mfWatchlist = watchlist.filter((w) => w["kind"] === "mf");

  return (
    <div className="markets-panel">
      {unavailable && (
        <div className="news-view__notice">
          Market data is unavailable right now (this uses an unofficial data source that can be
          intermittently unreliable). Try refreshing shortly.
        </div>
      )}

      <div className="markets-panel__section">
        <h3 className="markets-panel__section-title">Indices</h3>
        <div className="markets-indices">
          {INDICES.map((idx) => {
            const q = indexQuotes[idx.symbol];
            return (
              <div className="markets-index-card" key={idx.symbol}>
                <span className="markets-index-card__label">{idx.label}</span>
                <span className="markets-index-card__price">{q?.price?.toLocaleString() ?? (loading ? "…" : "—")}</span>
                <ChangeBadge pct={q?.changePercent ?? null} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="markets-panel__section">
        <div className="markets-panel__section-head">
          <h3 className="markets-panel__section-title">Watchlist</h3>
        </div>
        <div className="markets-panel__add-row">
          <input
            className="news-view__manage-input"
            placeholder="Symbol, e.g. RELIANCE.NS or TCS.NS"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSymbol.trim()) {
                void addToWatchlist(newSymbol.trim().toUpperCase(), "stock");
                setNewSymbol("");
              }
            }}
          />
          <button
            className="btn btn--primary btn--sm"
            onClick={() => {
              if (newSymbol.trim()) {
                void addToWatchlist(newSymbol.trim().toUpperCase(), "stock");
                setNewSymbol("");
              }
            }}
          >
            <Plus size={13} strokeWidth={2} /> Add
          </button>
        </div>
        {stockWatchlist.length === 0 ? (
          <div className="news-view__empty">No stocks yet. Add an NSE symbol above (e.g. RELIANCE.NS).</div>
        ) : (
          stockWatchlist.map((row) => {
            const symbol = row["symbol"] as string;
            const q = watchlistQuotes[symbol];
            return (
              <div key={row.id as string} className="markets-watch-item">
                <button className="markets-watch-item__row" onClick={() => void toggleExpand(symbol)}>
                  <span className="markets-watch-item__symbol">{(row["display_name"] as string) || symbol}</span>
                  <span className="markets-watch-item__price">{q?.price?.toLocaleString() ?? "—"}</span>
                  <ChangeBadge pct={q?.changePercent ?? null} />
                </button>
                <button className="icon-btn" onClick={() => void removeFromWatchlist(row)}>
                  <XIcon size={13} strokeWidth={2} />
                </button>
                {expandedSymbol === symbol && (
                  <div className="markets-watch-item__chart">
                    {candlesLoading ? (
                      <div className="news-view__empty">
                        <span className="spinner" aria-hidden /> Loading chart…
                      </div>
                    ) : (
                      <CandlestickChart candles={candles} />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="markets-panel__section">
        <h3 className="markets-panel__section-title">Trending</h3>
        {trending.length === 0 ? (
          <div className="news-view__empty">No trending data right now.</div>
        ) : (
          <div className="markets-trending">
            {trending.map((symbol) => {
              const q = trendingQuotes[symbol];
              const alreadyAdded = stockWatchlist.some((w) => w["symbol"] === symbol);
              return (
                <div key={symbol} className="markets-trending-chip">
                  <span>{symbol}</span>
                  <ChangeBadge pct={q?.changePercent ?? null} />
                  {!alreadyAdded && (
                    <button className="icon-btn" title="Add to watchlist" onClick={() => void addToWatchlist(symbol, "stock")}>
                      <Plus size={12} strokeWidth={2} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="markets-panel__section">
        <h3 className="markets-panel__section-title">Mutual Funds</h3>
        <div className="markets-panel__add-row">
          <input
            className="news-view__manage-input"
            placeholder="Search mutual fund name…"
            value={mfQuery}
            onChange={(e) => setMfQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void searchMf()}
          />
          <button className="btn btn--ghost btn--sm" onClick={() => void searchMf()}>
            <Search size={13} strokeWidth={2} /> Search
          </button>
        </div>
        {mfResults.length > 0 && (
          <div className="markets-mf-results">
            {mfResults.map((mf) => (
              <div key={mf.schemeCode} className="markets-mf-result-row">
                <span>{mf.schemeName}</span>
                <button
                  className="icon-btn"
                  title="Add to watchlist"
                  onClick={() => {
                    void addToWatchlist(String(mf.schemeCode), "mf", mf.schemeName, String(mf.schemeCode));
                    setMfResults([]);
                    setMfQuery("");
                  }}
                >
                  <Plus size={13} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
        {mfWatchlist.length === 0 ? (
          <div className="news-view__empty">No mutual funds yet. Search above.</div>
        ) : (
          mfWatchlist.map((row) => (
            <div key={row.id as string} className="markets-watch-item">
              <button
                className="markets-watch-item__row"
                onClick={() => void toggleExpandMf(row["scheme_code"] as string)}
              >
                <span className="markets-watch-item__symbol">{row["display_name"] as string}</span>
              </button>
              <button className="icon-btn" onClick={() => void removeFromWatchlist(row)}>
                <XIcon size={13} strokeWidth={2} />
              </button>
              {expandedMf === row["scheme_code"] && (
                <div className="markets-watch-item__chart">
                  <NavTrendLine nav={mfNav} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
