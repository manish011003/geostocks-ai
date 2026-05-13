import { NextResponse } from "next/server";
import {
  fetchAllWatchlist,
  fetchStocksByExchange,
  fallbackStocks,
  type StockRequest,
} from "@/lib/stocks";
import { getCache, setCache } from "@/lib/cache";
import {
  DEFAULT_STOCKS,
  EXCHANGES,
  EXCHANGE_KEYS,
  allDefaultStocks,
  resolveExchange,
  type ExchangeKey,
} from "@/lib/exchanges";
import type { StockData } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_TTL_MS = 60 * 1000;

/**
 * Stock prices endpoint.
 *
 * Query parameters:
 *   - symbols   comma-separated, either bare ("AAPL") or `SYM:EXCHANGE`
 *               ("RELIANCE:BSE"). v1 callers without exchange suffixes are
 *               still served correctly (we default to US).
 *   - exchange  optional. When provided AND `symbols` is absent, the
 *               server seeds the response with that exchange's default
 *               watchlist (or "ALL" → every exchange's defaults). When
 *               provided AND `symbols` IS present, bare symbols inherit
 *               this exchange (so `?symbols=RELIANCE,TCS&exchange=NSE`
 *               works without per-symbol annotation).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get("symbols");
  const exchangeParam = (searchParams.get("exchange") ?? "").toUpperCase().trim();

  // ─── 1. explicit symbols ───────────────────────────────────────────────
  if (symbolsParam) {
    const requests: StockRequest[] = symbolsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((raw) => {
        const upper = raw.toUpperCase();
        if (upper.includes(":")) {
          const [sym, exchange] = upper.split(":");
          return { sym, exchange };
        }
        // Fall back to query-level exchange hint if provided.
        const defaultEx = EXCHANGES[exchangeParam as ExchangeKey]
          ? (exchangeParam as ExchangeKey)
          : resolveExchange(upper);
        return { sym: upper, exchange: defaultEx };
      });

    const cacheKey = `stocks:${requests
      .map((r) => `${r.sym}:${r.exchange}`)
      .sort()
      .join(",")}`;
    const cached = getCache<StockData[]>(cacheKey);
    if (cached && cached.length > 0) {
      return NextResponse.json({ stocks: cached, cached: true });
    }

    try {
      const stocks = await fetchStocksByExchange(requests);
      if (stocks.length === 0) {
        // Fallback for the rare case where every Yahoo call fails. We
        // synthesise from `fallbackStocks` filtered to what was asked for.
        const wanted = new Set(requests.map((r) => `${r.sym}:${r.exchange}`));
        const fb = fallbackStocks().filter((s) =>
          wanted.has(`${s.sym}:${s.exchange}`)
        );
        return NextResponse.json({ stocks: fb, cached: false, fallback: true });
      }
      setCache(cacheKey, stocks, CACHE_TTL_MS);
      return NextResponse.json({ stocks, cached: false });
    } catch (err) {
      console.error("[api/stocks] symbols error", err);
      return NextResponse.json({
        stocks: [],
        cached: false,
        fallback: true,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // ─── 2. exchange-scoped defaults ───────────────────────────────────────
  // `?exchange=ALL` or empty → every exchange's seed list
  // `?exchange=BSE`         → only BSE seeds
  // No exchange + no symbols → v1 behaviour (`fetchAllWatchlist`)
  if (exchangeParam) {
    const cacheKey = `stocks:exchange:${exchangeParam}`;
    const cached = getCache<StockData[]>(cacheKey);
    if (cached && cached.length > 0) {
      return NextResponse.json({ stocks: cached, cached: true });
    }

    const requests: StockRequest[] =
      exchangeParam === "ALL"
        ? allDefaultStocks().map((s) => ({
            sym: s.sym,
            exchange: s.exchange,
            name: s.name,
            sector: s.sector,
          }))
        : EXCHANGE_KEYS.includes(exchangeParam as ExchangeKey)
          ? DEFAULT_STOCKS[exchangeParam as ExchangeKey].map((s) => ({
              sym: s.sym,
              exchange: exchangeParam,
              name: s.name,
              sector: s.sector,
            }))
          : [];

    if (requests.length === 0) {
      return NextResponse.json(
        { stocks: [], error: `unknown exchange: ${exchangeParam}` },
        { status: 400 }
      );
    }

    try {
      const stocks = await fetchStocksByExchange(requests);
      if (stocks.length === 0) {
        return NextResponse.json({
          stocks: fallbackStocks(),
          cached: false,
          fallback: true,
        });
      }
      setCache(cacheKey, stocks, CACHE_TTL_MS);
      return NextResponse.json({ stocks, cached: false });
    } catch (err) {
      console.error("[api/stocks] exchange error", err);
      return NextResponse.json({
        stocks: fallbackStocks(),
        cached: false,
        fallback: true,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // ─── 3. legacy v1 fallback (no params at all) ──────────────────────────
  const cacheKey = "stocks:watchlist";
  const cached = getCache<StockData[]>(cacheKey);
  if (cached && cached.length > 0) {
    return NextResponse.json({ stocks: cached, cached: true });
  }
  try {
    const stocks = await fetchAllWatchlist();
    if (stocks.length === 0) {
      return NextResponse.json({
        stocks: fallbackStocks(),
        cached: false,
        fallback: true,
      });
    }
    setCache(cacheKey, stocks, CACHE_TTL_MS);
    return NextResponse.json({ stocks, cached: false });
  } catch (err) {
    console.error("[api/stocks] default error", err);
    return NextResponse.json({
      stocks: fallbackStocks(),
      cached: false,
      fallback: true,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
