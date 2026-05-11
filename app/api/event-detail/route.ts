import { NextResponse } from "next/server";
import { type Schema, SchemaType } from "@google/generative-ai";
import {
  availableModels,
  getGeminiClient,
  runGeminiWithFallback,
} from "@/lib/gemini";
import { getCache, setCache } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_TTL_MS = 30 * 60 * 1000;

const SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    background: { type: SchemaType.STRING },
    market_impact: { type: SchemaType.STRING },
    affected_stocks: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    affected_sectors: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    severity_reason: { type: SchemaType.STRING },
    timeline: { type: SchemaType.STRING },
  },
  required: [
    "summary",
    "background",
    "market_impact",
    "affected_stocks",
    "affected_sectors",
    "severity_reason",
    "timeline",
  ],
};

const SYSTEM_PROMPT = `You are a senior geopolitical intelligence analyst.
Given a news headline + region + severity, produce a structured analysis.
Be specific, cite plausible tickers (NYSE/NASDAQ/global), and avoid hedging language.
Respond ONLY with JSON matching the provided schema. Keep total output under ~280 words.`;

interface ReqBody {
  id?: string;
  title?: string;
  region?: string;
  severity?: string;
  source?: string;
  url?: string;
}

interface DetailResponse {
  summary: string;
  background: string;
  market_impact: string;
  affected_stocks: string[];
  affected_sectors: string[];
  severity_reason: string;
  timeline: string;
  sources: { name: string; url: string }[];
}

function fallbackDetail(body: ReqBody): DetailResponse {
  const sectors = ["finance"];
  return {
    summary: `${body.title ?? "Unknown event"}.`,
    background: `Context for ${body.region ?? "the region"} is currently unavailable; check back shortly.`,
    market_impact: `Likely volatility in ${body.region ?? "the region"}-exposed equities. Safe-haven assets may benefit.`,
    affected_stocks: [],
    affected_sectors: sectors,
    severity_reason: `Tagged ${body.severity ?? "MEDIUM"} from headline keywords.`,
    timeline: "Resolution timeframe is unclear.",
    sources: body.url
      ? [{ name: body.source ?? "source", url: body.url }]
      : [],
  };
}

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const cacheKey = `event-detail:${body.id ?? body.title.slice(0, 80)}`;
  const cached = getCache<DetailResponse>(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const client = getGeminiClient();
  if (!client) {
    return NextResponse.json({ ...fallbackDetail(body), fallback: true });
  }

  // If every model is on cooldown there's no point dialing the API again.
  if (availableModels().length === 0) {
    return NextResponse.json({
      ...fallbackDetail(body),
      fallback: true,
      reason: "quota_exhausted",
    });
  }

  const userPrompt = `HEADLINE: ${body.title}
REGION: ${body.region ?? "unknown"}
SEVERITY: ${body.severity ?? "MEDIUM"}
SOURCE: ${body.source ?? ""}
URL: ${body.url ?? ""}`;

  try {
    const text = await runGeminiWithFallback(async (modelName) => {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          temperature: 0.4,
        },
      });
      const result = await model.generateContent(userPrompt);
      return result.response.text();
    });
    const parsed = JSON.parse(text) as Omit<DetailResponse, "sources">;
    const payload: DetailResponse = {
      ...parsed,
      sources: body.url
        ? [{ name: body.source ?? "source", url: body.url }]
        : [],
    };
    setCache(cacheKey, payload, CACHE_TTL_MS);
    return NextResponse.json(payload);
  } catch (err) {
    console.warn("[api/event-detail] all models failed:", err);
    return NextResponse.json({ ...fallbackDetail(body), fallback: true });
  }
}
