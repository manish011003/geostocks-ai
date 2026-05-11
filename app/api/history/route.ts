import { NextResponse } from "next/server";
import { fetchHistory, type Range } from "@/lib/stocks";
import { getCache, setCache } from "@/lib/cache";
import { rsi as rsiAt } from "@/lib/technical";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TTL_MS = 60 * 1000;
const VALID: Range[] = ["1mo", "3mo", "6mo", "1y", "2y", "5y"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase().trim();
  const rangeRaw = searchParams.get("range") ?? "1mo";
  const range = (VALID.includes(rangeRaw as Range) ? rangeRaw : "1mo") as Range;
  // 5d isn't a Yahoo daily range we treat specially; just fall back to 1mo.
  const apiRange =
    rangeRaw === "5d" ? "1mo" : (range as Range);

  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  const cacheKey = `history:${symbol}:${apiRange}`;
  const cached = getCache<unknown>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const h = await fetchHistory(symbol, apiRange);
  if (!h) {
    return NextResponse.json(
      { error: "history fetch failed", bars: [], rsi: [] },
      { status: 502 }
    );
  }

  // Compute RSI as a rolling series (one value per bar, NaN until enough bars).
  const closes = h.bars.map((b) => b.c);
  const rsiSeries: number[] = closes.map((_, i) =>
    i < 14 ? Number.NaN : rsiAt(closes.slice(0, i + 1), 14)
  );

  // For 5d, slice the last ~7 bars from the 1mo result.
  const bars =
    rangeRaw === "5d" ? h.bars.slice(-7) : h.bars;
  const rsiOut =
    rangeRaw === "5d" ? rsiSeries.slice(-7) : rsiSeries;

  const payload = {
    symbol,
    range: rangeRaw,
    bars,
    rsi: rsiOut,
    meta: {
      currency: h.currency,
      fiftyTwoWeekHigh: h.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: h.fiftyTwoWeekLow,
    },
  };

  setCache(cacheKey, payload, TTL_MS);
  return NextResponse.json(payload);
}
