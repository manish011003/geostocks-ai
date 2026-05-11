import type { StockData } from "@/types";

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
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketChangePercent?: number;
        currency?: string;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
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
 * Yahoo Finance v8 chart endpoint — no API key required.
 * https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1d&range=1mo
 */
export async function fetchYahoo(symbol: string): Promise<StockData | null> {
  const meta = WATCHLIST.find((w) => w.sym === symbol) ?? {
    sym: symbol,
    name: symbol,
    sector: "other",
  };

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
    const result = json.chart?.result?.[0];
    if (!result) return null;

    const price = result.meta.regularMarketPrice ?? 0;
    const prev =
      result.meta.chartPreviousClose ?? result.meta.previousClose ?? price;
    const changePercent =
      typeof result.meta.regularMarketChangePercent === "number"
        ? result.meta.regularMarketChangePercent
        : prev
          ? ((price - prev) / prev) * 100
          : 0;
    const change = price - prev;

    const closes = (result.indicators?.quote?.[0]?.close ?? [])
      .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));

    return {
      sym: meta.sym,
      name: meta.name,
      sector: meta.sector,
      price,
      change,
      changePercent,
      sparkline: closes,
      currency: result.meta.currency,
    };
  } catch (err) {
    console.warn(`[yahoo] ${symbol} fetch failed`, err);
    return null;
  }
}

export async function fetchAllWatchlist(): Promise<StockData[]> {
  const results = await Promise.all(WATCHLIST.map((w) => fetchYahoo(w.sym)));
  return results.filter((r): r is StockData => r !== null);
}

/** Fetch quotes for an arbitrary symbol list (used by the user-editable
 *  watchlists). Symbols not found are silently dropped. */
export async function fetchSymbols(symbols: string[]): Promise<StockData[]> {
  if (symbols.length === 0) return [];
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  const results = await Promise.all(unique.map((s) => fetchYahoo(s)));
  return results.filter((r): r is StockData => r !== null);
}

/**
 * Pull historical OHLC bars from Yahoo Finance. Used by the chatbot to give
 * Gemini real price context (1-year by default) when answering predictions.
 */
export async function fetchHistory(
  symbol: string,
  range: Range = "1y"
): Promise<History | null> {
  // Yahoo's daily bars work for ranges up to ~10y. We pick weekly bars for
  // multi-year ranges so we don't blow the prompt size.
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
      bars.push({ t: ts[i] * 1000, o, h, l, c, v: typeof v === "number" ? v : 0 });
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
  realizedVolPct: number; // annualised log-return stdev, %
  recent: Array<{ date: string; close: number; pct: number }>;
}

/**
 * Compress a History into a small summary object that fits comfortably inside
 * an LLM prompt: start, end, hi/lo, vol, plus the last 8 closes for context.
 */
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

  // Realised volatility: stdev of daily/weekly log returns, annualised.
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

/** Deterministic synthetic fallback so the dashboard renders even when
 *  Yahoo Finance is unavailable (rate-limited, blocked, etc). */
export function fallbackStocks(): StockData[] {
  const seed = (s: string) =>
    [...s].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);

  return WATCHLIST.map(({ sym, name, sector }, i) => {
    const base = 50 + (seed(sym) % 350);
    const sparkline = Array.from({ length: 22 }, (_, k) => {
      const drift = Math.sin((k + i) * 0.7) * 6 + Math.cos(k * 0.3) * 3;
      return +(base + drift).toFixed(2);
    });
    const price = sparkline[sparkline.length - 1];
    const prev = sparkline[sparkline.length - 2] ?? price;
    return {
      sym,
      name,
      sector,
      price,
      change: price - prev,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      sparkline,
      currency: "USD",
    };
  });
}
