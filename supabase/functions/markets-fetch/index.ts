// Dispatcher for the Markets tab. Every unofficial-endpoint call lives in
// ./yahoo.ts so it can be swapped for a licensed provider later without
// touching this file or the frontend. No polling — called on open/refresh only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchQuote, fetchCandles, fetchTrending, searchMutualFunds, fetchMutualFundNav } from "./yahoo.ts";

const MAX_SYMBOLS = 30;

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
    const type = String(body?.type ?? "");

    let result: unknown;

    switch (type) {
      case "quotes": {
        const symbols: string[] = Array.isArray(body?.symbols) ? body.symbols.slice(0, MAX_SYMBOLS) : [];
        const settled = await Promise.allSettled(symbols.map((s) => fetchQuote(s)));
        result = settled.map((r, i) =>
          r.status === "fulfilled" ? r.value : { symbol: symbols[i], price: null, previousClose: null, changePercent: null, currency: null }
        );
        break;
      }
      case "candles": {
        const symbol = String(body?.symbol ?? "");
        if (!symbol) throw new Error("symbol is required");
        result = await fetchCandles(symbol, body?.range ?? "6mo", body?.interval ?? "1d");
        break;
      }
      case "trending": {
        result = await fetchTrending();
        break;
      }
      case "mf-search": {
        const query = String(body?.query ?? "");
        result = query ? await searchMutualFunds(query) : [];
        break;
      }
      case "mf-nav": {
        const schemeCode = String(body?.schemeCode ?? "");
        if (!schemeCode) throw new Error("schemeCode is required");
        result = await fetchMutualFundNav(schemeCode);
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Yahoo's endpoints are unofficial and can fail unpredictably — always
    // return a clean JSON error so the UI can show "unavailable" rather than
    // a raw network error.
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
