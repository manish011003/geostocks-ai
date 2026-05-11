import { NextResponse } from "next/server";
import { fetchHeadlines, fallbackHeadlines } from "@/lib/news";
import { tagHeadlines } from "@/lib/gemini";
import { getCache, setCache } from "@/lib/cache";
import type { GeoEvent } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_KEY = "news:tagged";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function GET() {
  const cached = getCache<GeoEvent[]>(CACHE_KEY);
  if (cached && cached.length > 0) {
    return NextResponse.json({ events: cached, cached: true });
  }

  let usingFallback = false;
  let errorMsg: string | undefined;

  let raw;
  try {
    raw = await fetchHeadlines(10);
  } catch (err) {
    console.warn("[api/news] news provider failed, using fallback:", err);
    raw = fallbackHeadlines();
    usingFallback = true;
    errorMsg = err instanceof Error ? err.message : "news provider error";
  }

  let events: GeoEvent[] = [];
  try {
    events = await tagHeadlines(raw);
  } catch (err) {
    console.error("[api/news] tagHeadlines failed", err);
    events = [];
    errorMsg = err instanceof Error ? err.message : "tagging error";
  }

  if (events.length > 0) {
    setCache(CACHE_KEY, events, CACHE_TTL_MS);
  }

  return NextResponse.json({
    events,
    cached: false,
    fallback: usingFallback,
    ...(errorMsg ? { error: errorMsg } : {}),
  });
}
