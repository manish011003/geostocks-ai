import { NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface YahooSearchResp {
  quotes?: Array<{
    symbol: string;
    longname?: string;
    shortname?: string;
    exchange?: string;
    exchDisp?: string;
    quoteType?: string;
    typeDisp?: string;
    sector?: string;
    industry?: string;
  }>;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Map a Yahoo `exchDisp` string to a country flag emoji. Best-effort — Yahoo
 * doesn't surface country codes directly. Falls back to a globe emoji.
 */
function flagForExchange(exch: string | undefined): {
  flag: string;
  country: string;
} {
  if (!exch) return { flag: "🌐", country: "—" };
  const e = exch.toUpperCase();
  if (e.includes("NMS") || e.includes("NCM") || e.includes("NYQ") || e.includes("NASDAQ") || e.includes("NYSE") || e.includes("BATS") || e.includes("ARCA"))
    return { flag: "🇺🇸", country: "US" };
  if (e.includes("NSE") || e.includes("BSE")) return { flag: "🇮🇳", country: "IN" };
  if (e.includes("LSE") || e.includes("LON")) return { flag: "🇬🇧", country: "GB" };
  if (e.includes("TSE") || e.includes("TYO") || e.includes("JPX")) return { flag: "🇯🇵", country: "JP" };
  if (e.includes("HKG") || e.includes("HKSE")) return { flag: "🇭🇰", country: "HK" };
  if (e.includes("SHA") || e.includes("SHE") || e.includes("SHH") || e.includes("SHZ")) return { flag: "🇨🇳", country: "CN" };
  if (e.includes("FRA") || e.includes("XETR") || e.includes("GER")) return { flag: "🇩🇪", country: "DE" };
  if (e.includes("PAR") || e.includes("EPA")) return { flag: "🇫🇷", country: "FR" };
  if (e.includes("MIL")) return { flag: "🇮🇹", country: "IT" };
  if (e.includes("AMS")) return { flag: "🇳🇱", country: "NL" };
  if (e.includes("MAD") || e.includes("BME")) return { flag: "🇪🇸", country: "ES" };
  if (e.includes("STO") || e.includes("STK") || e.includes("OMX")) return { flag: "🇸🇪", country: "SE" };
  if (e.includes("OSL")) return { flag: "🇳🇴", country: "NO" };
  if (e.includes("CPH")) return { flag: "🇩🇰", country: "DK" };
  if (e.includes("HEL")) return { flag: "🇫🇮", country: "FI" };
  if (e.includes("TOR") || e.includes("TSX") || e.includes("CN")) return { flag: "🇨🇦", country: "CA" };
  if (e.includes("ASX") || e.includes("AUS")) return { flag: "🇦🇺", country: "AU" };
  if (e.includes("KOE") || e.includes("KOSDAQ") || e.includes("KRX")) return { flag: "🇰🇷", country: "KR" };
  if (e.includes("TAI") || e.includes("TWSE")) return { flag: "🇹🇼", country: "TW" };
  if (e.includes("BMV") || e.includes("MEX")) return { flag: "🇲🇽", country: "MX" };
  if (e.includes("SAO") || e.includes("BVMF")) return { flag: "🇧🇷", country: "BR" };
  if (e.includes("BCS") || e.includes("BCBA")) return { flag: "🇦🇷", country: "AR" };
  if (e.includes("JSE")) return { flag: "🇿🇦", country: "ZA" };
  return { flag: "🌐", country: e };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  const key = `search:${q.toLowerCase()}`;
  const cached = getCache<unknown>(key);
  if (cached) return NextResponse.json(cached);

  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    q
  )}&quotesCount=8&newsCount=0`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { results: [], error: `Yahoo HTTP ${res.status}` },
        { status: 502 }
      );
    }
    const data = (await res.json()) as YahooSearchResp;
    const quotes = (data.quotes ?? []).filter(
      (q) =>
        q.symbol &&
        q.quoteType &&
        ["EQUITY", "ETF", "MUTUALFUND", "INDEX", "CURRENCY"].includes(q.quoteType)
    );

    const results = quotes.slice(0, 8).map((q) => {
      const { flag, country } = flagForExchange(q.exchDisp ?? q.exchange);
      return {
        sym: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        exchange: q.exchDisp ?? q.exchange ?? "",
        country,
        flag,
        type: q.typeDisp || q.quoteType,
        sector: q.sector,
      };
    });

    const payload = { results };
    setCache(key, payload, CACHE_TTL_MS);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[api/search-stock] error", err);
    return NextResponse.json(
      {
        results: [],
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
}
