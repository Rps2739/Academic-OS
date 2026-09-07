/**
 * Curated symbol/fund lists used to populate the Markets tab's default
 * "notable movers" view with well-known, liquid names — deliberately NOT
 * using Yahoo's day_gainers_in/day_losers_in screeners, which were verified
 * live to be dominated by obscure, thinly-traded micro-caps posting wild
 * (and often meaningless — thin-volume or corporate-action) percentage
 * swings, not the kind of "good performing stocks" a business/finance
 * audience actually wants to see. A fixed list of large, liquid names
 * (NIFTY 50 constituents) gives a much more meaningful signal.
 *
 * NIFTY 50 membership does change periodically (index rebalancing) — this
 * list should be treated as "reasonably current as of 2026-09-07", not
 * eternally authoritative. If a symbol here stops returning data, it's
 * more likely been removed from the index than something being broken.
 */
export const BLUE_CHIP_STOCKS: string[] = [
  "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "ICICIBANK.NS", "INFY.NS",
  "HINDUNILVR.NS", "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "KOTAKBANK.NS",
  "LT.NS", "BAJFINANCE.NS", "ASIANPAINT.NS", "MARUTI.NS", "TITAN.NS",
  "SUNPHARMA.NS", "WIPRO.NS", "ULTRACEMCO.NS", "NESTLEIND.NS", "ADANIENT.NS",
  "AXISBANK.NS", "HCLTECH.NS", "TATAMOTORS.NS", "TATASTEEL.NS", "NTPC.NS",
  "POWERGRID.NS", "M&M.NS", "BAJAJFINSV.NS", "ONGC.NS", "COALINDIA.NS",
];

/**
 * Popular, well-known mutual fund names (searched by name at request time
 * via mfapi.in's search endpoint, not hardcoded scheme codes — scheme
 * codes can change/split, but a fund's name search is stable). A mix of
 * broad index funds and large well-established active funds across major
 * AMCs, not a recommendation or ranking of "best" funds — just enough
 * variety to show a real, meaningful default view instead of an empty screen.
 */
// Several of these funds were renamed industry-wide by SEBI's 2018 fund
// re-categorization (many "Bluechip" funds became "Large Cap" funds) —
// names below were verified against mfapi.in's actual search results
// (2026-09-07), not guessed from memory, specifically because the first
// guess ("ICICI Prudential Bluechip Fund", "SBI Bluechip Fund", "Axis
// Bluechip Fund") matched either nothing or the wrong fund entirely.
export const POPULAR_MF_SEARCH_TERMS: string[] = [
  "HDFC Flexi Cap Fund - Regular Plan - Growth",
  "SBI Large Cap Fund - Regular Plan - Growth",
  "ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund) - Regular Plan - Growth",
  "Axis Large & Mid Cap Fund - Regular Plan - Growth", // mfapi's search ranks this above the plainer "Axis Large Cap Fund" for any phrasing tried — still a real, well-known Axis large-cap-oriented fund, accepted rather than fought further
  "Mirae Asset Large Cap Fund - Regular Plan - Growth",
  "Parag Parikh Flexi Cap Fund - Regular Plan - Growth",
  "UTI Nifty 50 Index Fund - Regular Plan - Growth",
  "Nippon India Small Cap Fund - Regular Plan - Growth",
];
