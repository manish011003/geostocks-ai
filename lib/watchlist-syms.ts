/** Bare symbol list — safe to import on the client without pulling in
 *  server-only deps from `lib/stocks.ts`. */
export const WATCHLIST_SYMS = [
  "AAPL",
  "TSLA",
  "XOM",
  "LMT",
  "NVDA",
  "BA",
  "CVX",
  "GOLD",
] as const;
