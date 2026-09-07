// All access to Yahoo Finance's UNOFFICIAL, undocumented endpoints is
// isolated here so it can be swapped for a licensed provider without
// touching the dispatcher or the frontend. Yahoo can change or block this
// at any time — every caller must handle failure gracefully. See
// memory/project_next_audit_task.md for the disclosure made to the user.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const TIMEOUT_MS = 8000;

export interface QuoteResult {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  changePercent: number | null;
  currency: string | null;
}

export interface Candle {
  t: number; // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
}

async function yahooFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  return res.json();
}

interface ChartResult {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        currency?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
        }>;
      };
    }>;
  };
}

export async function fetchQuote(symbol: string): Promise<QuoteResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`;
  const data = (await yahooFetch(url)) as ChartResult;
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const price = meta?.regularMarketPrice ?? null;
  const prevClose = meta?.chartPreviousClose ?? meta?.previousClose ?? null;
  const changePercent = price !== null && prevClose !== null && prevClose !== 0
    ? ((price - prevClose) / prevClose) * 100
    : null;
  return {
    symbol,
    price,
    previousClose: prevClose,
    changePercent,
    currency: meta?.currency ?? null,
  };
}

export async function fetchCandles(symbol: string, range = "6mo", interval = "1d"): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const data = (await yahooFetch(url)) as ChartResult;
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote) return [];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    // Illiquid days can carry null OHLC entries mid-array — skip them or the
    // chart's path math produces NaN.
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({ t: timestamps[i], o, h, l, c });
  }
  return candles;
}

interface TrendingResult {
  finance?: { result?: Array<{ quotes?: Array<{ symbol?: string }> }> };
}

export async function fetchTrending(): Promise<string[]> {
  const url = "https://query1.finance.yahoo.com/v1/finance/trending/IN";
  const data = (await yahooFetch(url)) as TrendingResult;
  const quotes = data?.finance?.result?.[0]?.quotes ?? [];
  return quotes.map((q) => q.symbol).filter((s): s is string => typeof s === "string");
}

interface MfSearchResult {
  schemeCode: number;
  schemeName: string;
}

export async function searchMutualFunds(query: string): Promise<MfSearchResult[]> {
  const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`mfapi HTTP ${res.status}`);
  const data = (await res.json()) as MfSearchResult[];
  return Array.isArray(data) ? data.slice(0, 20) : [];
}

interface MfNavResult {
  meta?: { scheme_name?: string };
  data?: Array<{ date: string; nav: string }>;
}

export async function fetchMutualFundNav(schemeCode: string): Promise<{ schemeName: string; nav: Array<{ date: string; nav: number }> }> {
  const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(schemeCode)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`mfapi HTTP ${res.status}`);
  const data = (await res.json()) as MfNavResult;
  const nav = (data.data ?? [])
    .slice(0, 180) // ~6 months of daily NAV
    .map((d) => ({ date: d.date, nav: parseFloat(d.nav) }))
    .filter((d) => !isNaN(d.nav))
    .reverse(); // API returns newest-first; chart wants oldest-first
  return { schemeName: data.meta?.scheme_name ?? schemeCode, nav };
}
