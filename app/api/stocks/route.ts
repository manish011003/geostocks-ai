import { NextResponse } from "next/server";
import {
  fetchAllWatchlist,
  fetchSymbols,
  fallbackStocks,
} from "@/lib/stocks";
import { getCache, setCache } from "@/lib/cache";
import type { StockData } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get("symbols");
  const symbols = symbolsParam
    ? symbolsParam
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : null;

  // Cache key per request shape so user watchlists don't poison the default.
  const cacheKey = symbols
    ? `stocks:${symbols.sort().join(",")}`
    : "stocks:watchlist";

  const cached = getCache<StockData[]>(cacheKey);
  if (cached && cached.length > 0) {
    return NextResponse.json({ stocks: cached, cached: true });
  }

  try {
    const stocks = symbols
      ? await fetchSymbols(symbols)
      : await fetchAllWatchlist();
    if (stocks.length === 0) {
      const fb = symbols ? [] : fallbackStocks();
      return NextResponse.json({ stocks: fb, cached: false, fallback: true });
    }
    setCache(cacheKey, stocks, CACHE_TTL_MS);
    return NextResponse.json({ stocks, cached: false });
  } catch (err) {
    console.error("[api/stocks] error", err);
    const fb = symbols ? [] : fallbackStocks();
    return NextResponse.json({
      stocks: fb,
      cached: false,
      fallback: true,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
