import { NextResponse } from "next/server";
import { tagHeadlines, analyzeTicker } from "@/lib/gemini";
import { fetchHeadlines, fallbackHeadlines } from "@/lib/news";
import { WATCHLIST, fetchHistory } from "@/lib/stocks";
import { getCache, setCache } from "@/lib/cache";
import { rsi, macd, sma, realizedVolPct } from "@/lib/technical";
import {
  EXCHANGES,
  buildYahooSymbol,
  resolveExchange,
  type ExchangeKey,
} from "@/lib/exchanges";
import type { GeoEvent } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NEWS_CACHE_KEY = "news:tagged";
const PREDICTION_TTL_MS = 5 * 60 * 1000;

const SIGNAL_WEIGHTS = {
  news: 0.3,
  technical: 0.25,
  regional_risk: 0.2,
  sector: 0.15,
  volatility: 0.1,
} as const;

interface SectorImpact {
  defense?: number;
  energy?: number;
  tech?: number;
  finance?: number;
  commodities?: number;
  consumer?: number;
  industrials?: number;
}

const SECTOR_IMPACT: Record<string, SectorImpact> = {
  military_conflict: { defense: 80, energy: 60, tech: -30, finance: -40 },
  trade_war: { tech: -70, finance: -50, commodities: 40 },
  sanctions: { energy: 50, finance: -60, commodities: 30 },
  election: { finance: -20, tech: -10, consumer: -10 },
  peace_deal: { defense: -40, energy: -20, finance: 30 },
  diplomacy: { defense: -10, finance: 10 },
  cyber_attack: { tech: -40, finance: -30, defense: 30 },
};

function classifyEventType(e: GeoEvent): keyof typeof SECTOR_IMPACT {
  const t = `${e.title} ${e.summary}`.toLowerCase();
  if (/\b(war|attack|strike|missile|invasion|conflict|combat|military)\b/.test(t)) return "military_conflict";
  if (/\btariff|trade war|export control|chip ban\b/.test(t)) return "trade_war";
  if (/\bsanction|embargo\b/.test(t)) return "sanctions";
  if (/\belection|vote|ballot|polls?\b/.test(t)) return "election";
  if (/\bpeace|ceasefire|truce|deal|accord\b/.test(t)) return "peace_deal";
  if (/\bcyber|hack|ransomware\b/.test(t)) return "cyber_attack";
  return "diplomacy";
}

async function ensureEvents(): Promise<GeoEvent[]> {
  const cached = getCache<GeoEvent[]>(NEWS_CACHE_KEY);
  if (cached && cached.length > 0) return cached;
  let raw;
  try {
    raw = await fetchHeadlines(10);
  } catch {
    raw = fallbackHeadlines();
  }
  const events = await tagHeadlines(raw);
  if (events.length > 0) setCache(NEWS_CACHE_KEY, events, 10 * 60 * 1000);
  return events;
}

interface SignalReadout {
  score: number; // -100..100
  weight: number;
  detail: Record<string, unknown>;
}

interface CompositeResponse {
  ticker: string;
  composite_score: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  signals: {
    news: SignalReadout;
    technical: SignalReadout;
    regional_risk: SignalReadout;
    sector: SignalReadout;
    volatility: SignalReadout;
  };
  reasoning: string[];
  key_triggers: string[];
  price_target_range: { low: number; high: number; timeframe: string };
  current_price?: number;
}

function clamp(n: number, lo = -100, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

export async function POST(req: Request) {
  let body: { ticker?: string; exchange?: string };
  try {
    body = (await req.json()) as { ticker?: string; exchange?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ticker = body.ticker?.toUpperCase().trim();
  if (!ticker) {
    return NextResponse.json({ error: "Missing 'ticker' in body" }, { status: 400 });
  }

  // v2: resolve the exchange so fetchHistory uses the right Yahoo suffix
  // (.BO for BSE, .NS for NSE, etc.). Falls back to NYSE/NASDAQ defaults
  // when no exchange hint is supplied, preserving v1 behaviour.
  const exchangeHint = (body.exchange ?? "").toUpperCase();
  const exchangeKey = (
    EXCHANGES[exchangeHint as ExchangeKey]
      ? (exchangeHint as ExchangeKey)
      : resolveExchange(ticker)
  ) as ExchangeKey;
  const yahooSym = buildYahooSymbol(ticker, exchangeKey);

  const meta =
    WATCHLIST.find((w) => w.sym === ticker) ?? {
      sym: ticker,
      name: ticker,
      sector: "tech",
    };

  const cacheKey = `prediction:v2:${yahooSym}`;
  const cached = getCache<CompositeResponse>(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  try {
    const [events, history] = await Promise.all([
      ensureEvents(),
      fetchHistory(yahooSym, "3mo"),
    ]);

    const closes = (history?.bars ?? []).map((b) => b.c);
    const currentPrice = closes.length ? closes[closes.length - 1] : undefined;

    // ---------- Signal 2: Technical ----------
    const r = rsi(closes, 14);
    const m = macd(closes);
    const sma20 = sma(closes, 20);

    const rsiScore = Number.isFinite(r) ? clamp((r - 50) * 2) : 0;
    const macdScore = Number.isFinite(m.macd) && Number.isFinite(m.signal)
      ? m.macd > m.signal ? 50 : -50
      : 0;
    const smaScore =
      currentPrice !== undefined && Number.isFinite(sma20)
        ? currentPrice > sma20 ? 30 : -30
        : 0;
    const techScore = clamp(
      rsiScore * 0.4 + macdScore * 0.35 + smaScore * 0.25
    );

    // ---------- Signal 5: Volatility ----------
    const vol = realizedVolPct(closes);
    // High vol pulls confidence down (slightly bearish bias);
    // very low vol → mildly positive signal (calm regime)
    const volScore = !Number.isFinite(vol)
      ? 0
      : vol > 50
        ? -25
        : vol > 25
          ? -10
          : 10;

    // ---------- Signal 1: News sentiment (heuristic, refined later by Gemini) ----------
    const relevant = events.filter((e) =>
      (e.affected_sectors as string[]).includes(meta.sector)
    );
    const newsScoreRaw =
      relevant.length === 0
        ? 0
        : relevant.reduce((s, e) => {
            // Defense gets a positive bias on conflict; energy on supply shocks
            let w = e.severity === "HIGH" ? -55 : e.severity === "MEDIUM" ? -25 : 5;
            if (meta.sector === "defense" && e.severity !== "LOW") w = -w;
            if (meta.sector === "commodities" && e.severity === "HIGH") w = -w;
            return s + w;
          }, 0) / relevant.length;
    const newsScore = clamp(newsScoreRaw);

    // ---------- Signal 3: Regional risk delta (count of recent vs older HIGH events) ----------
    const recentHigh = events.filter((e) => {
      if (e.severity !== "HIGH") return false;
      const age = Date.now() - new Date(e.publishedAt).getTime();
      return age < 24 * 3600_000;
    }).length;
    const olderHigh = events.filter((e) => {
      if (e.severity !== "HIGH") return false;
      const age = Date.now() - new Date(e.publishedAt).getTime();
      return age >= 24 * 3600_000;
    }).length;
    const riskDeltaRaw = (recentHigh - olderHigh) * 18;
    // Defense / commodities benefit from rising risk; everyone else suffers.
    const riskScore =
      meta.sector === "defense" || meta.sector === "commodities"
        ? clamp(riskDeltaRaw)
        : clamp(-riskDeltaRaw);

    // ---------- Signal 4: Sector correlation ----------
    let sectorAccum = 0;
    const sectorTriggers: string[] = [];
    for (const e of relevant.slice(0, 6)) {
      const cat = classifyEventType(e);
      const impact = SECTOR_IMPACT[cat] ?? {};
      const v = (impact as Record<string, number>)[meta.sector];
      if (typeof v === "number") {
        sectorAccum += v;
        sectorTriggers.push(`${cat}: ${v > 0 ? "+" : ""}${v}`);
      }
    }
    const sectorScore = clamp(
      relevant.length > 0 ? sectorAccum / Math.max(1, relevant.length) : 0
    );

    // ---------- Composite ----------
    const composite =
      newsScore * SIGNAL_WEIGHTS.news +
      techScore * SIGNAL_WEIGHTS.technical +
      riskScore * SIGNAL_WEIGHTS.regional_risk +
      sectorScore * SIGNAL_WEIGHTS.sector +
      volScore * SIGNAL_WEIGHTS.volatility;

    const direction: CompositeResponse["direction"] =
      composite > 15 ? "BULLISH" : composite < -15 ? "BEARISH" : "NEUTRAL";
    const confidence = Math.min(95, Math.abs(composite) + (Number.isFinite(vol) ? 10 : 0));

    // ---------- Refine with Gemini for narrative reasoning + triggers ----------
    let reasoning: string[] = [];
    let triggers: string[] = [];
    try {
      const gem = await analyzeTicker(ticker, meta.sector, events);
      reasoning = gem.reasoning ?? [];
      triggers = gem.key_triggers ?? [];
    } catch (err) {
      console.warn("[api/analyze] gemini narrative failed:", err);
    }
    if (reasoning.length === 0) {
      reasoning = relevant
        .slice(0, 4)
        .map((e) => `${e.region}: ${e.title}`);
    }
    if (triggers.length === 0) {
      triggers = Array.from(
        new Set(relevant.flatMap((e) => e.affected_sectors as string[]))
      ).slice(0, 4);
    }

    // ---------- Price target range (7-day, scaled by realised vol) ----------
    let priceTarget = { low: 0, high: 0, timeframe: "7d" };
    if (currentPrice !== undefined) {
      const dailyVol = Number.isFinite(vol) ? vol / 100 / Math.sqrt(252) : 0.015;
      const mean1w = currentPrice * (1 + (composite / 100) * 0.04);
      const sd1w = currentPrice * dailyVol * Math.sqrt(7);
      priceTarget = {
        low: +(mean1w - sd1w).toFixed(2),
        high: +(mean1w + sd1w).toFixed(2),
        timeframe: "7d",
      };
    }

    const payload: CompositeResponse = {
      ticker,
      composite_score: +composite.toFixed(1),
      direction,
      confidence: +confidence.toFixed(0),
      signals: {
        news: {
          score: +newsScore.toFixed(0),
          weight: SIGNAL_WEIGHTS.news,
          detail: { headlines_analyzed: relevant.length },
        },
        technical: {
          score: +techScore.toFixed(0),
          weight: SIGNAL_WEIGHTS.technical,
          detail: {
            rsi: Number.isFinite(r) ? +r.toFixed(1) : null,
            macd: Number.isFinite(m.macd) ? +m.macd.toFixed(3) : null,
            macd_signal: Number.isFinite(m.signal) ? +m.signal.toFixed(3) : null,
            sma20: Number.isFinite(sma20) ? +sma20.toFixed(2) : null,
            price_vs_sma20: smaScore > 0 ? "above" : smaScore < 0 ? "below" : "n/a",
          },
        },
        regional_risk: {
          score: +riskScore.toFixed(0),
          weight: SIGNAL_WEIGHTS.regional_risk,
          detail: {
            recent_high_severity: recentHigh,
            older_high_severity: olderHigh,
            sector_bias:
              meta.sector === "defense" || meta.sector === "commodities"
                ? "safe-haven"
                : "exposed",
          },
        },
        sector: {
          score: +sectorScore.toFixed(0),
          weight: SIGNAL_WEIGHTS.sector,
          detail: {
            sector: meta.sector,
            event_breakdown: sectorTriggers,
          },
        },
        volatility: {
          score: volScore,
          weight: SIGNAL_WEIGHTS.volatility,
          detail: {
            realized_vol_pct: Number.isFinite(vol) ? +vol.toFixed(1) : null,
          },
        },
      },
      reasoning,
      key_triggers: triggers,
      price_target_range: priceTarget,
      current_price: currentPrice,
    };

    setCache(cacheKey, payload, PREDICTION_TTL_MS);
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    console.error("[api/analyze] error", err);
    return NextResponse.json(
      {
        error: "analyze failed",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
}
