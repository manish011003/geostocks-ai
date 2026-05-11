import {
  GoogleGenerativeAI,
  SchemaType,
  type Schema,
} from "@google/generative-ai";
import type { GeoEvent, Prediction, Severity } from "@/types";
import type { RawHeadline } from "@/lib/news";
import { regionToCoords } from "@/lib/geo";

/**
 * Models tried in order. If the upstream returns 503 / quota errors we fall
 * through to the next entry. We include flash and flash-lite variants from
 * multiple Gemini generations because they're billed against different free-
 * tier quota buckets, so when one is exhausted another usually still works.
 *
 * The chain is intentionally ordered by quality, not by quota size — we want
 * the best response when capacity is available and the most-likely-to-respond
 * when capacity is tight.
 */
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];

let _client: GoogleGenerativeAI | null = null;
function client(): GoogleGenerativeAI | null {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _client = new GoogleGenerativeAI(apiKey);
  return _client;
}

export function getGeminiClient(): GoogleGenerativeAI | null {
  return client();
}

export const GEMINI_MODEL = MODEL_CHAIN[0];
export const GEMINI_MODEL_CHAIN = MODEL_CHAIN;

/** True if the error is a transient upstream failure we should retry with the
 *  next model (overload / quota / temporary outage). */
export function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|quota|overload)/i.test(msg);
}

/** Specifically a hard quota / rate-limit hit, vs a generic 503 outage. */
function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(429|RESOURCE_EXHAUSTED|quota|too many requests)/i.test(msg);
}

/** A daily free-tier hit (vs a per-minute burst limit) — much longer cooldown. */
function isDailyFreeTierError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /free_tier_requests|per\s*day|day\s*limit/i.test(msg);
}

/** Pull the suggested retry delay (in seconds) out of a Gemini error message.
 *  Gemini returns either a "Please retry in 11.884929488s" hint or a
 *  RetryInfo block with `"retryDelay":"11s"`. */
function getRetryDelaySec(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m1 = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (m1) return parseFloat(m1[1]);
  const m2 = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  if (m2) return parseFloat(m2[1]);
  return null;
}

/** Cooldown registry — module-scoped so it survives across requests in the
 *  same Node instance and we don't keep banging on a 429'd model. */
interface ModelCooldown {
  until: number;
  reason: "quota_day" | "quota_burst" | "transient";
  detail: string;
}
const COOLDOWNS = new Map<string, ModelCooldown>();

const COOLDOWN_TRANSIENT_MS = 60 * 1000;
const COOLDOWN_BURST_QUOTA_MS = 5 * 60 * 1000;
const COOLDOWN_DAILY_QUOTA_MS = 60 * 60 * 1000; // 1h, conservative re-check
const COOLDOWN_MAX_MS = 6 * 60 * 60 * 1000;

function markCooldown(modelName: string, err: unknown): ModelCooldown {
  const retrySec = getRetryDelaySec(err);
  let reason: ModelCooldown["reason"] = "transient";
  let durationMs = retrySec ? retrySec * 1000 : COOLDOWN_TRANSIENT_MS;

  if (isQuotaError(err)) {
    if (isDailyFreeTierError(err)) {
      reason = "quota_day";
      // Trust the suggested retry but cap so we eventually re-probe.
      durationMs = retrySec
        ? Math.min(Math.max(retrySec * 1000, COOLDOWN_DAILY_QUOTA_MS), COOLDOWN_MAX_MS)
        : COOLDOWN_DAILY_QUOTA_MS;
    } else {
      reason = "quota_burst";
      durationMs = retrySec ? retrySec * 1000 : COOLDOWN_BURST_QUOTA_MS;
    }
  }

  const cd: ModelCooldown = {
    until: Date.now() + durationMs,
    reason,
    detail: err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240),
  };
  COOLDOWNS.set(modelName, cd);
  return cd;
}

function isOnCooldown(modelName: string): boolean {
  const cd = COOLDOWNS.get(modelName);
  if (!cd) return false;
  if (Date.now() >= cd.until) {
    COOLDOWNS.delete(modelName);
    return false;
  }
  return true;
}

/** Models that are currently candidates for a request (i.e. not on cooldown). */
export function availableModels(): string[] {
  return MODEL_CHAIN.filter((m) => !isOnCooldown(m));
}

export interface GeminiUnavailable {
  unavailable: true;
  reason: "no_key" | "quota_exhausted" | "all_failed";
  cooldowns: { model: string; reason: string; retryAtIso: string }[];
}

export function geminiAvailability(): GeminiUnavailable | null {
  if (!client()) {
    return { unavailable: true, reason: "no_key", cooldowns: [] };
  }
  const free = availableModels();
  if (free.length === 0) {
    const cds = MODEL_CHAIN.map((m) => {
      const c = COOLDOWNS.get(m);
      return c
        ? {
            model: m,
            reason: c.reason,
            retryAtIso: new Date(c.until).toISOString(),
          }
        : null;
    }).filter((x): x is NonNullable<typeof x> => x !== null);
    return { unavailable: true, reason: "quota_exhausted", cooldowns: cds };
  }
  return null;
}

/**
 * Run `op(model)` against each non-cooled-down model in MODEL_CHAIN until one
 * succeeds. Models that fail with a transient error get added to the cooldown
 * registry so subsequent requests in the same Node instance skip them until
 * the quota window resets.
 *
 * Exported alias so other routes (event-detail, chat, ...) can share the same
 * cooldown-aware retry loop.
 */
export async function runGeminiWithFallback<T>(
  op: (modelName: string) => Promise<T>
): Promise<T> {
  return runWithFallback(op);
}

async function runWithFallback<T>(
  op: (modelName: string) => Promise<T>
): Promise<T> {
  let lastErr: unknown;
  let attempted = 0;
  for (const m of MODEL_CHAIN) {
    if (isOnCooldown(m)) continue;
    attempted += 1;
    try {
      return await op(m);
    } catch (err) {
      lastErr = err;
      if (!isTransientGeminiError(err)) throw err;
      const cd = markCooldown(m, err);
      console.warn(
        `[gemini] ${m} ${cd.reason} until ${new Date(cd.until).toISOString()}, trying next model:`,
        err
      );
    }
  }
  if (attempted === 0) {
    throw new Error(
      "All Gemini models are on cooldown — free-tier quota likely exhausted."
    );
  }
  throw lastErr ?? new Error("All Gemini models unavailable");
}

function extractJson(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

interface TaggedHeadline {
  title: string;
  severity: Severity;
  region: string;
  lat: number;
  lon: number;
  affected_sectors: string[];
  summary: string;
}

/** Heuristic tagger used when GEMINI_API_KEY is missing or the call fails. */
function heuristicTag(h: RawHeadline): TaggedHeadline {
  const t = `${h.title} ${h.description}`.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  let region = "Global";
  if (has("ukraine", "russia", "moscow", "kyiv", "kremlin", "putin")) region = "Eastern Europe";
  else if (has("china", "taiwan", "korea", "japan", "beijing", "tokyo", "seoul")) region = "East Asia";
  else if (has("iran", "israel", "gaza", "saudi", "yemen", "syria", "lebanon", "tehran", "houthi", "strait of hormuz", "red sea")) region = "Middle East";
  else if (has("india", "pakistan", "afghanistan", "kashmir", "delhi", "bangladesh"))  region = "South Asia";
  else if (has("nigeria", "ethiopia", "sudan", "africa", "sahel", "congo", "kenya", "south africa")) region = "Africa";
  else if (has("brazil", "argentina", "venezuela", "colombia", "chile", "peru")) region = "South America";
  else if (
    has(
      "u.s.",
      "us ",
      "united states",
      "biden",
      "trump",
      "white house",
      "washington",
      "fed ",
      "federal reserve",
      "wall street",
      "new york",
      "canada",
      "mexico"
    )
  )
    region = "North America";
  else if (has("germany", "france", "uk", "britain", "italy", "spain", "europe", "eu "))  region = "Western Europe";
  else if (has("vietnam", "indonesia", "philippines", "malaysia", "thailand", "south china sea")) region = "Southeast Asia";
  else if (has("australia", "pacific", "new zealand")) region = "Oceania";

  let severity: Severity = "LOW";
  if (has("war", "attack", "strike", "missile", "invasion", "killed", "casualties", "nuclear")) severity = "HIGH";
  else if (has("sanction", "tariff", "tension", "dispute", "protest", "deploy", "warning", "embargo", "cyber")) severity = "MEDIUM";

  const sectors: string[] = [];
  if (has("oil", "gas", "energy", "crude", "lng", "pipeline", "opec")) sectors.push("energy");
  if (has("defense", "defence", "military", "weapons", "missile", "army", "nato", "munition", "arms")) sectors.push("defense");
  if (has("chip", "semiconductor", "tech", "ai ", "artificial intelligence", "software")) sectors.push("tech");
  if (has("gold", "silver", "copper", "lithium", "rare earth", "minerals", "mining")) sectors.push("commodities");
  if (has("bank", "currency", "fed", "ecb", "rates", "yield", "fx", "dollar", "yuan", "ruble"))  sectors.push("finance");
  if (sectors.length === 0) sectors.push("finance");

  const { lat, lon } = regionToCoords(region);
  const summary = h.description?.slice(0, 180) || h.title.slice(0, 180);

  return {
    title: h.title,
    severity,
    region,
    lat,
    lon,
    affected_sectors: sectors,
    summary,
  };
}

const TAG_SCHEMA: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      title: { type: SchemaType.STRING },
      severity: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["HIGH", "MEDIUM", "LOW"],
      },
      region: {
        type: SchemaType.STRING,
        format: "enum",
        enum: [
          "Middle East",
          "East Asia",
          "Eastern Europe",
          "South Asia",
          "Africa",
          "North America",
          "South America",
          "Central America",
          "Western Europe",
          "Northern Europe",
          "Southern Europe",
          "Southeast Asia",
          "Central Asia",
          "Oceania",
          "Global",
        ],
      },
      lat: { type: SchemaType.NUMBER },
      lon: { type: SchemaType.NUMBER },
      affected_sectors: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
      },
      summary: { type: SchemaType.STRING },
    },
    required: [
      "title",
      "severity",
      "region",
      "lat",
      "lon",
      "affected_sectors",
      "summary",
    ],
  },
};

const TAG_SYSTEM = `You are a geopolitical risk analyst.
Given news headlines, output a JSON array. Each item must contain:
- title: echo of the input headline
- severity: HIGH (active conflict / casualties / major sanctions), MEDIUM (tensions, threats, policy moves), LOW (diplomacy, background)
- region: one of Middle East, East Asia, Eastern Europe, South Asia, Africa, North America, South America, Central America, Western Europe, Northern Europe, Southern Europe, Southeast Asia, Central Asia, Oceania, Global. Pick the MOST SPECIFIC region; only use Global if the story is genuinely worldwide.
- lat, lon: representative coordinate INSIDE the country most central to the story (e.g. US headlines should plot near Washington DC ~38.9, -77.0; LatAm near specific capital; Europe near Brussels/Berlin/etc.). Never (0,0) unless truly Global.
- affected_sectors: subset of energy, defense, tech, commodities, finance, consumer, industrials
- summary: one neutral sentence, <= 180 chars
Return strictly JSON.`;

export async function tagHeadlines(
  headlines: RawHeadline[]
): Promise<GeoEvent[]> {
  if (headlines.length === 0) return [];

  const c = client();
  let tagged: TaggedHeadline[] | null = null;

  if (c) {
    try {
      const userMsg = `Analyze these headlines:\n${headlines
        .map(
          (h, i) =>
            `${i + 1}. ${h.title}${h.description ? ` — ${h.description}` : ""}`
        )
        .join("\n")}`;

      const text = await runWithFallback(async (modelName) => {
        const model = c.getGenerativeModel({
          model: modelName,
          systemInstruction: TAG_SYSTEM,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: TAG_SCHEMA,
            temperature: 0.4,
          },
        });
        const resp = await model.generateContent(userMsg);
        return resp.response.text();
      });

      const parsed = JSON.parse(extractJson(text));
      if (Array.isArray(parsed)) tagged = parsed as TaggedHeadline[];
    } catch (err) {
      console.warn(
        "[gemini] tagHeadlines failed, falling back to heuristics:",
        err
      );
    }
  }

  if (!tagged) {
    tagged = headlines.map(heuristicTag);
  }

  return headlines.map((h, i) => {
    const t =
      tagged!.find(
        (x) =>
          x?.title && x.title.toLowerCase() === h.title.toLowerCase()
      ) ??
      tagged![i] ??
      heuristicTag(h);

    const region = t.region ?? "Global";
    const fallback = regionToCoords(region);
    // Guard against (0,0) in the Atlantic — that's almost never a real event.
    const useFallback =
      typeof t.lat !== "number" ||
      typeof t.lon !== "number" ||
      (Math.abs(t.lat) < 0.5 && Math.abs(t.lon) < 0.5);
    const lat = useFallback ? fallback.lat : t.lat;
    const lon = useFallback ? fallback.lon : t.lon;

    return {
      id: `evt-${i}-${Buffer.from(h.title).toString("base64").slice(0, 10)}`,
      title: h.title,
      summary: t.summary || h.description?.slice(0, 180) || h.title,
      severity: (t.severity as Severity) ?? "LOW",
      region,
      lat,
      lon,
      affected_sectors: Array.isArray(t.affected_sectors)
        ? t.affected_sectors
        : ["finance"],
      publishedAt: h.publishedAt,
      source: h.source,
      url: h.url,
    };
  });
}

const PREDICT_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    sentiment_score: { type: SchemaType.NUMBER },
    direction: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["Up", "Down", "Sideways"],
    },
    confidence: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["Low", "Medium", "High"],
    },
    reasoning: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    key_triggers: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: [
    "sentiment_score",
    "direction",
    "confidence",
    "reasoning",
    "key_triggers",
  ],
};

const PREDICT_SYSTEM = `You are an equity strategist.
Given a stock ticker, sector, and recent geopolitical headlines, output a JSON object describing the near-term directional bias.
Schema:
- sentiment_score: number between -1 (strongly bearish) and 1 (strongly bullish)
- direction: "Up" | "Down" | "Sideways"
- confidence: "Low" | "Medium" | "High"
- reasoning: 3-5 short bullet points
- key_triggers: 2-4 short phrases naming the headline themes that matter most
Return strictly JSON.`;

function heuristicPrediction(
  ticker: string,
  sector: string,
  events: GeoEvent[]
): Prediction {
  const relevant = events.filter((e) =>
    (e.affected_sectors as string[]).includes(sector)
  );
  const score =
    relevant.reduce((s, e) => {
      const w =
        e.severity === "HIGH" ? -0.3 : e.severity === "MEDIUM" ? -0.15 : 0.05;
      if (sector === "defense" && e.severity !== "LOW") return s - w;
      if (sector === "commodities" && e.severity === "HIGH") return s - w;
      return s + w;
    }, 0) / Math.max(1, relevant.length);

  const clamped = Math.max(-1, Math.min(1, score));
  const direction: Prediction["direction"] =
    clamped > 0.1 ? "Up" : clamped < -0.1 ? "Down" : "Sideways";
  const confidence: Prediction["confidence"] =
    relevant.length >= 4 ? "High" : relevant.length >= 2 ? "Medium" : "Low";

  return {
    ticker,
    sentiment_score: +clamped.toFixed(2),
    direction,
    confidence,
    reasoning: relevant.slice(0, 4).map((e) => `${e.region}: ${e.title}`),
    key_triggers: Array.from(
      new Set(relevant.flatMap((e) => e.affected_sectors as string[]))
    ).slice(0, 4),
  };
}

export async function analyzeTicker(
  ticker: string,
  sector: string,
  events: GeoEvent[]
): Promise<Prediction> {
  const c = client();
  const relevant = events
    .filter((e) => (e.affected_sectors as string[]).includes(sector))
    .slice(0, 12);

  if (!c || relevant.length === 0) {
    return heuristicPrediction(ticker, sector, events);
  }

  try {
    const user = `Ticker: ${ticker}\nSector: ${sector}\nRecent geopolitical headlines:\n${relevant
      .map((e, i) => `${i + 1}. [${e.severity}/${e.region}] ${e.title}`)
      .join("\n")}`;

    const text = await runWithFallback(async (modelName) => {
      const model = c.getGenerativeModel({
        model: modelName,
        systemInstruction: PREDICT_SYSTEM,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: PREDICT_SCHEMA,
          temperature: 0.5,
        },
      });
      const resp = await model.generateContent(user);
      return resp.response.text();
    });

    const parsed = JSON.parse(extractJson(text)) as Omit<Prediction, "ticker">;
    return { ticker, ...parsed };
  } catch (err) {
    console.warn("[gemini] analyzeTicker failed, falling back:", err);
    return heuristicPrediction(ticker, sector, events);
  }
}
