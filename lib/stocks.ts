import type { StockData } from "@/types";
import {
  EXCHANGES,
  buildYahooSymbol,
  resolveExchange,
  stripYahooSuffix,
  type ExchangeKey,
} from "@/lib/exchanges";

/**
 * v1 left a hard-coded US watchlist here. v2 moves the per-exchange seed
 * lists into `lib/exchanges.ts`, but we keep this thin export alive so any
 * caller that hasn't been migrated yet (e.g. legacy chart context) still
 * sees the original 8-symbol US watchlist.
 */
export const WATCHLIST: { sym: string; name: string; sector: string }[] = [
  { sym: "AAPL", name: "Apple Inc.", sector: "tech" },
  { sym: "TSLA", name: "Tesla Inc.", sector: "tech" },
  { sym: "XOM", name: "Exxon Mobil", sector: "energy" },
  { sym: "LMT", name: "Lockheed Martin", sector: "defense" },
  { sym: "NVDA", name: "NVIDIA Corp.", sector: "tech" },
  { sym: "BA", name: "Boeing Co.", sector: "defense" },
  { sym: "CVX", name: "Chevron Corp.", sector: "energy" },
  { sym: "GOLD", name: "Barrick Gold", sector: "commodities" },
];

interface YahooResp {
  chart: {
    result?: Array<{
      meta: {
        symbol?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketChangePercent?: number;
        currency?: string;
        exchangeName?: string;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        regularMarketVolume?: number;
      };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          close?: Array<number | null>;
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

export type Range = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";

export interface HistoryBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface History {
  symbol: string;
  range: Range;
  currency?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  bars: HistoryBar[];
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * v2 input shape — a bare ticker plus the exchange it belongs to. v1
 * callers (e.g. `/api/history` with `?symbol=AAPL`) still hit `fetchYahoo`
 * directly with no exchange metadata and continue to work.
 */
export interface StockRequest {
  sym: string;
  exchange?: ExchangeKey | string;
  /** Human-friendly display name, e.g. "Reliance Industries". */
  name?: string;
  sector?: string;
}

/**
 * Low-level Yahoo Finance fetch. `symbol` is already the fully-qualified
 * Yahoo ticker (e.g. "RELIANCE.NS", "AAPL", "7203.T"). Returns a partial
 * `StockData` enriched with whatever meta the call returns; the caller is
 * responsible for stamping `name`/`sector`/`exchange`.
 */
async function fetchYahooQuote(symbol: string): Promise<{
  price: number;
  prev: number;
  change: number;
  changePercent: number;
  sparkline: number[];
  currency?: string;
  dayHigh?: number;
  dayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  volume?: number;
  exchangeName?: string;
} | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=1mo`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[yahoo] ${symbol} HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as YahooResp;
    const r = json.chart?.result?.[0];
    if (!r) return null;

    const price = r.meta.regularMarketPrice ?? 0;
    const prev = r.meta.chartPreviousClose ?? r.meta.previousClose ?? price;
    const changePercent =
      typeof r.meta.regularMarketChangePercent === "number"
        ? r.meta.regularMarketChangePercent
        : prev
          ? ((price - prev) / prev) * 100
          : 0;
    const change = price - prev;
    const closes = (r.indicators?.quote?.[0]?.close ?? []).filter(
      (v): v is number => typeof v === "number" && !Number.isNaN(v)
    );

    return {
      price,
      prev,
      change,
      changePercent,
      sparkline: closes,
      currency: r.meta.currency,
      dayHigh: r.meta.regularMarketDayHigh,
      dayLow: r.meta.regularMarketDayLow,
      fiftyTwoWeekHigh: r.meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: r.meta.fiftyTwoWeekLow,
      volume: r.meta.regularMarketVolume,
      exchangeName: r.meta.exchangeName,
    };
  } catch (err) {
    console.warn(`[yahoo] ${symbol} fetch failed`, err);
    return null;
  }
}

/**
 * v1 entry point preserved for backward compatibility. Tries the symbol as
 * given (i.e. respects a "RELIANCE.NS"-style fully-qualified ticker), and
 * if there's no exchange hint defaults to NYSE/NASDAQ.
 */
export async function fetchYahoo(symbol: string): Promise<StockData | null> {
  const meta = WATCHLIST.find((w) => w.sym === symbol) ?? {
    sym: symbol,
    name: stripYahooSuffix(symbol),
    sector: "other",
  };
  const exchange = resolveExchange(symbol);
  const quote = await fetchYahooQuote(symbol);
  if (!quote) return null;
  return {
    sym: meta.sym,
    name: meta.name,
    sector: meta.sector,
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    sparkline: quote.sparkline,
    currency: quote.currency ?? EXCHANGES[exchange].currency,
    exchange,
    yahooSym: symbol,
    flag: EXCHANGES[exchange].flag,
  };
}

/**
 * v2: fetch one stock by **bare** symbol + exchange. Internally builds the
 * fully-qualified Yahoo symbol so the caller never has to remember `.BO`
 * vs `.NS` vs no-suffix-for-US.
 */
export async function fetchStockPrice(
  req: StockRequest
): Promise<StockData | null> {
  const exchange = resolveExchange(req.sym, req.exchange) as ExchangeKey;
  const yahooSym = buildYahooSymbol(req.sym, exchange);
  const quote = await fetchYahooQuote(yahooSym);
  if (!quote) return null;
  const ex = EXCHANGES[exchange];
  return {
    sym: req.sym.toUpperCase(),
    name: req.name ?? stripYahooSuffix(req.sym),
    sector: req.sector ?? "other",
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    sparkline: quote.sparkline,
    currency: quote.currency ?? ex.currency,
    exchange,
    yahooSym,
    flag: ex.flag,
  };
}

/** v1 default-watchlist loader, kept for compatibility. */
export async function fetchAllWatchlist(): Promise<StockData[]> {
  const results = await Promise.all(WATCHLIST.map((w) => fetchYahoo(w.sym)));
  return results.filter((r): r is StockData => r !== null);
}

/**
 * Fetch arbitrary symbols. Each entry may be:
 *   - a bare US ticker            "AAPL"               → NYSE/NASDAQ default
 *   - a Yahoo-style suffix ticker "RELIANCE.NS"        → exchange auto-detected
 *   - an `SYM:EXCHANGE` pair      "RELIANCE:NSE"       → explicit, v2 preferred
 *
 * Always uses Promise.allSettled so one bad ticker doesn't kill the rest.
 */
export async function fetchSymbols(symbols: string[]): Promise<StockData[]> {
  if (symbols.length === 0) return [];
  const requests: StockRequest[] = symbols
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      if (raw.includes(":")) {
        const [sym, exchange] = raw.split(":");
        return { sym: sym.toUpperCase(), exchange };
      }
      return { sym: raw.toUpperCase() };
    });
  const settled = await Promise.allSettled(requests.map(fetchStockPrice));
  return settled
    .filter(
      (r): r is PromiseFulfilledResult<StockData> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);
}

/**
 * v2: fetch many tickers in parallel given full {sym, exchange} metadata.
 * Used by the upgraded /api/stocks route.
 */
export async function fetchStocksByExchange(
  requests: StockRequest[]
): Promise<StockData[]> {
  if (requests.length === 0) return [];
  const settled = await Promise.allSettled(requests.map(fetchStockPrice));
  return settled
    .filter(
      (r): r is PromiseFulfilledResult<StockData> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);
}

/**
 * Pull historical OHLC bars. Symbol must be a fully-qualified Yahoo ticker
 * (use `buildYahooSymbol(sym, exchange)` when calling from a v2 site).
 */
export async function fetchHistory(
  symbol: string,
  range: Range = "1y"
): Promise<History | null> {
  const interval = range === "5y" || range === "2y" ? "1wk" : "1d";

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=${interval}&range=${range}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooResp;
    const r = json.chart?.result?.[0];
    if (!r || !r.timestamp || !r.indicators?.quote?.[0]) return null;

    const ts = r.timestamp;
    const q = r.indicators.quote[0];
    const bars: HistoryBar[] = [];

    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i];
      const h = q.high?.[i];
      const l = q.low?.[i];
      const c = q.close?.[i];
      const v = q.volume?.[i] ?? 0;
      if (
        typeof o !== "number" ||
        typeof h !== "number" ||
        typeof l !== "number" ||
        typeof c !== "number" ||
        Number.isNaN(c)
      ) {
        continue;
      }
      bars.push({
        t: ts[i] * 1000,
        o,
        h,
        l,
        c,
        v: typeof v === "number" ? v : 0,
      });
    }

    return {
      symbol,
      range,
      currency: r.meta.currency,
      fiftyTwoWeekHigh: r.meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: r.meta.fiftyTwoWeekLow,
      bars,
    };
  } catch (err) {
    console.warn(`[yahoo:history] ${symbol} failed`, err);
    return null;
  }
}

export interface HistorySummary {
  symbol: string;
  range: Range;
  bars: number;
  start: { date: string; close: number };
  end: { date: string; close: number };
  high: number;
  low: number;
  pctChange: number;
  realizedVolPct: number;
  recent: Array<{ date: string; close: number; pct: number }>;
}

export function summarizeHistory(h: History): HistorySummary {
  const bars = h.bars;
  const start = bars[0];
  const end = bars[bars.length - 1];

  let hi = -Infinity;
  let lo = Infinity;
  for (const b of bars) {
    if (b.h > hi) hi = b.h;
    if (b.l < lo) lo = b.l;
  }

  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i - 1].c > 0 && bars[i].c > 0) {
      rets.push(Math.log(bars[i].c / bars[i - 1].c));
    }
  }
  const mean = rets.reduce((s, r) => s + r, 0) / Math.max(1, rets.length);
  const variance =
    rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  const sd = Math.sqrt(variance);
  const stepsPerYear = h.range === "5y" || h.range === "2y" ? 52 : 252;
  const annualised = sd * Math.sqrt(stepsPerYear) * 100;

  const recent = bars.slice(-8).map((b, i, arr) => {
    const prev = i > 0 ? arr[i - 1].c : b.c;
    return {
      date: new Date(b.t).toISOString().slice(0, 10),
      close: +b.c.toFixed(2),
      pct: prev ? +(((b.c - prev) / prev) * 100).toFixed(2) : 0,
    };
  });

  return {
    symbol: h.symbol,
    range: h.range,
    bars: bars.length,
    start: {
      date: new Date(start.t).toISOString().slice(0, 10),
      close: +start.c.toFixed(2),
    },
    end: {
      date: new Date(end.t).toISOString().slice(0, 10),
      close: +end.c.toFixed(2),
    },
    high: +hi.toFixed(2),
    low: +lo.toFixed(2),
    pctChange: start.c
      ? +(((end.c - start.c) / start.c) * 100).toFixed(2)
      : 0,
    realizedVolPct: +annualised.toFixed(1),
    recent,
  };
}

/** Deterministic synthetic fallback so the dashboard still renders if
 *  Yahoo is rate-limited. v1 returned only the US watchlist; v2 widens
 *  the fallback to one stock per exchange so the UI shells stay coherent. */
export function fallbackStocks(): StockData[] {
  const seed = (s: string) =>
    [...s].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);

  const seedList: Array<{
    sym: string;
    name: string;
    sector: string;
    exchange: ExchangeKey;
  }> = [
    { sym: "AAPL", name: "Apple Inc.", sector: "tech", exchange: "NASDAQ" },
    { sym: "TSLA", name: "Tesla Inc.", sector: "tech", exchange: "NASDAQ" },
    { sym: "XOM", name: "Exxon Mobil", sector: "energy", exchange: "NYSE" },
    { sym: "LMT", name: "Lockheed Martin", sector: "defense", exchange: "NYSE" },
    { sym: "NVDA", name: "NVIDIA Corp.", sector: "tech", exchange: "NASDAQ" },
    { sym: "BA", name: "Boeing Co.", sector: "defense", exchange: "NYSE" },
    { sym: "CVX", name: "Chevron Corp.", sector: "energy", exchange: "NYSE" },
    { sym: "GOLD", name: "Barrick Gold", sector: "commodities", exchange: "NYSE" },
    { sym: "RELIANCE", name: "Reliance Industries", sector: "energy", exchange: "BSE" },
    { sym: "TCS", name: "Tata Consultancy", sector: "tech", exchange: "BSE" },
    { sym: "SHEL", name: "Shell", sector: "energy", exchange: "LSE" },
    { sym: "7203", name: "Toyota", sector: "auto", exchange: "TSE" },
  ];

  return seedList.map(({ sym, name, sector, exchange }, i) => {
    const base = 50 + (seed(sym + exchange) % 350);
    const sparkline = Array.from({ length: 22 }, (_, k) => {
      const drift = Math.sin((k + i) * 0.7) * 6 + Math.cos(k * 0.3) * 3;
      return +(base + drift).toFixed(2);
    });
    const price = sparkline[sparkline.length - 1];
    const prev = sparkline[sparkline.length - 2] ?? price;
    const ex = EXCHANGES[exchange];
    return {
      sym,
      name,
      sector,
      price,
      change: price - prev,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      sparkline,
      currency: ex.currency,
      exchange,
      yahooSym: buildYahooSymbol(sym, exchange),
      flag: ex.flag,
    };
  });
}
