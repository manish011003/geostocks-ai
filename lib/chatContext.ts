import {
  WATCHLIST,
  fetchAllWatchlist,
  fallbackStocks,
  fetchHistory,
  summarizeHistory,
  type HistorySummary,
} from "@/lib/stocks";
import { fetchHeadlines, fallbackHeadlines } from "@/lib/news";
import { tagHeadlines } from "@/lib/gemini";
import { getCache, setCache } from "@/lib/cache";
import type { GeoEvent, StockData } from "@/types";

const NEWS_CACHE = "news:tagged";
const NEWS_TTL = 10 * 60 * 1000;

const STOCKS_CACHE = "stocks:watchlist";
const STOCKS_TTL = 60 * 1000;

const HISTORY_CACHE_PREFIX = "history:";
const HISTORY_TTL = 30 * 60 * 1000;

async function getEvents(): Promise<GeoEvent[]> {
  const cached = getCache<GeoEvent[]>(NEWS_CACHE);
  if (cached && cached.length > 0) return cached;
  let raw;
  try {
    raw = await fetchHeadlines(10);
  } catch {
    raw = fallbackHeadlines();
  }
  const tagged = await tagHeadlines(raw);
  if (tagged.length > 0) setCache(NEWS_CACHE, tagged, NEWS_TTL);
  return tagged;
}

async function getStocks(): Promise<StockData[]> {
  const cached = getCache<StockData[]>(STOCKS_CACHE);
  if (cached && cached.length > 0) return cached;
  try {
    const live = await fetchAllWatchlist();
    if (live.length > 0) {
      setCache(STOCKS_CACHE, live, STOCKS_TTL);
      return live;
    }
  } catch {
    /* ignore */
  }
  return fallbackStocks();
}

/** Detect tickers mentioned in the user message. Falls back to all watchlist
 *  symbols if no obvious ticker is referenced. */
export function detectTickers(message: string): string[] {
  const upper = message.toUpperCase();
  const found = WATCHLIST.filter((w) =>
    new RegExp(`\\b${w.sym}\\b`).test(upper)
  ).map((w) => w.sym);
  return found;
}

export interface ChatContext {
  stocks: StockData[];
  events: GeoEvent[];
  histories: HistorySummary[];
  generatedAt: string;
}

export async function buildChatContext(
  message: string,
  forceTickers?: string[]
): Promise<ChatContext> {
  const [stocks, events] = await Promise.all([getStocks(), getEvents()]);

  const detected = forceTickers ?? detectTickers(message);
  const targets = detected.length > 0 ? detected : []; // empty = no per-ticker history

  const histories: HistorySummary[] = [];
  for (const sym of targets) {
    const cacheKey = `${HISTORY_CACHE_PREFIX}${sym}:1y`;
    const cached = getCache<HistorySummary>(cacheKey);
    if (cached) {
      histories.push(cached);
      continue;
    }
    const h = await fetchHistory(sym, "1y");
    if (h && h.bars.length > 0) {
      const summary = summarizeHistory(h);
      setCache(cacheKey, summary, HISTORY_TTL);
      histories.push(summary);
    }
  }

  return {
    stocks,
    events,
    histories,
    generatedAt: new Date().toISOString(),
  };
}

/** Render the context to a compact text block that fits in a Gemini prompt. */
export function renderContext(ctx: ChatContext): string {
  const lines: string[] = [];
  lines.push(`# Live Market & Geopolitics Snapshot`);
  lines.push(`Generated at: ${ctx.generatedAt}`);

  lines.push(`\n## Watchlist (live)`);
  ctx.stocks.forEach((s) => {
    lines.push(
      `- ${s.sym} (${s.sector}) — $${s.price.toFixed(2)}, ${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}% today`
    );
  });

  lines.push(`\n## Geopolitical Events (last fetch)`);
  ctx.events.slice(0, 12).forEach((e) => {
    lines.push(
      `- [${e.severity}/${e.region}] ${e.title} (sectors: ${(e.affected_sectors as string[]).join(",")})`
    );
  });

  if (ctx.histories.length > 0) {
    lines.push(`\n## Historical Price Context (1-year)`);
    ctx.histories.forEach((h) => {
      lines.push(
        `- ${h.symbol}: ${h.bars} daily bars, ${h.start.date} $${h.start.close} → ${h.end.date} $${h.end.close} (${h.pctChange >= 0 ? "+" : ""}${h.pctChange}%)`
      );
      lines.push(
        `  · 52w high $${h.high}, 52w low $${h.low}, annualised vol ~${h.realizedVolPct}%`
      );
      lines.push(
        `  · Last 8 closes: ${h.recent.map((r) => `${r.date}=$${r.close}`).join(", ")}`
      );
    });
  }

  return lines.join("\n");
}
