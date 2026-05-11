import { NextResponse } from "next/server";
import {
  GEMINI_MODEL_CHAIN,
  availableModels,
  getGeminiClient,
  isTransientGeminiError,
} from "@/lib/gemini";
import {
  buildChatContext,
  renderContext,
  type ChatContext,
  detectTickers,
} from "@/lib/chatContext";
import type { Content, GenerateContentRequest } from "@google/generative-ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  messages?: ChatMessage[];
  ticker?: string;
}

const SYSTEM_PROMPT = `You are GeoStock AI, an institutional-grade markets-and-geopolitics analyst embedded in a live trading dashboard.

Your job:
- Synthesise the LIVE CONTEXT block (watchlist quotes, AI-tagged geopolitical events, and 1-year historical price summaries) with the user's question.
- When asked for a stock prediction, structure your answer as:
  1. **Direction** — Up / Down / Sideways over the user's stated timeframe (assume 1-3 months if unspecified).
  2. **Confidence** — Low / Medium / High, justified by data quality and consensus of signals.
  3. **Geopolitical drivers** — name the specific events from the context that move this name.
  4. **Technical context** — cite 52-week range, recent trend, realised volatility, momentum from the recent closes.
  5. **Catalysts to watch** — 2-4 forward-looking triggers.
  6. **Risk** — what would invalidate the call.
- Use only the data in the LIVE CONTEXT for facts. Where information is missing, say so plainly rather than inventing it.
- Be concise. Use short paragraphs and tight bullet lists. Markdown is welcome.
- Never give personalised financial advice. Frame outputs as analytical scenarios, not recommendations to buy/sell.
- If the question is unrelated to markets/geopolitics, answer briefly and steer back to the dashboard's domain.`;

/** Friendly retry hint extracted from a Gemini quota error. */
function shortReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Match "Please retry in 11.88s" — show a clean one-liner.
  const retry = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (/free_tier_requests/i.test(msg)) {
    return "Free-tier daily request quota is exhausted on every Gemini model the app tried.";
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(msg)) {
    return retry
      ? `Gemini's per-minute rate limit is hit (retry in ~${retry[1]}s).`
      : "Gemini's per-minute rate limit is hit.";
  }
  if (/503|UNAVAILABLE/i.test(msg)) {
    return "Gemini is temporarily overloaded (HTTP 503). The app will keep retrying as capacity returns.";
  }
  if (/network|fetch failed|ECONN/i.test(msg)) {
    return "Couldn't reach generativelanguage.googleapis.com (network issue).";
  }
  return "An upstream error prevented the request.";
}

function noKeyAnswer(message: string, ctx: ChatContext, contextText: string) {
  return [
    "## GeoStock AI · offline analyst",
    "",
    "_No `GEMINI_API_KEY` is configured, so the LLM is disabled. Below is a deterministic snapshot of the live data the model would have analysed._",
    "",
    offlineAnalystSummary(message, ctx),
    "",
    "<details><summary>Raw LIVE CONTEXT used</summary>",
    "",
    "```",
    contextText,
    "```",
    "",
    "</details>",
  ].join("\n");
}

function busyAnswer(
  message: string,
  ctx: ChatContext,
  contextText: string,
  reason: string
) {
  return [
    "## GeoStock AI · offline analyst",
    "",
    `_Gemini is currently unavailable: **${reason}** The app fell back to its built-in analyst so you still get an answer._`,
    "",
    offlineAnalystSummary(message, ctx),
    "",
    "<details><summary>Raw LIVE CONTEXT used</summary>",
    "",
    "```",
    contextText,
    "```",
    "",
    "</details>",
  ].join("\n");
}

/** Deterministic mini-analyst that turns the LIVE CONTEXT into a structured
 *  markdown answer when the LLM is unreachable. */
function offlineAnalystSummary(message: string, ctx: ChatContext): string {
  const parts: string[] = [];
  const tickers = detectTickers(message);

  // Section 1 — direct answer per detected ticker
  if (tickers.length > 0) {
    parts.push(`### Per-ticker view`);
    for (const sym of tickers) {
      const stock = ctx.stocks.find((s) => s.sym === sym);
      const hist = ctx.histories.find((h) => h.symbol === sym);
      const relevant = ctx.events.filter((e) =>
        (e.affected_sectors as string[]).includes(stock?.sector ?? "")
      );
      const high = relevant.filter((e) => e.severity === "HIGH").length;
      const dirHint =
        relevant.length === 0
          ? "Sideways"
          : high >= 2 && stock?.sector === "defense"
            ? "Up (safe-haven flow)"
            : high >= 2
              ? "Down (sector under stress)"
              : "Sideways";
      parts.push(`**${sym}** — ${stock?.name ?? sym}`);
      if (stock) {
        parts.push(
          `- Now $${stock.price.toFixed(2)} (${stock.changePercent >= 0 ? "+" : ""}${stock.changePercent.toFixed(2)}% today, sector: ${stock.sector})`
        );
      }
      if (hist) {
        parts.push(
          `- 1-yr: $${hist.start.close} → $${hist.end.close} (${hist.pctChange >= 0 ? "+" : ""}${hist.pctChange}%); 52w range $${hist.low}-$${hist.high}; vol ~${hist.realizedVolPct}%`
        );
      }
      parts.push(`- Direction lean (heuristic): **${dirHint}**`);
      if (relevant.length > 0) {
        parts.push(
          `- Geopolitical drivers (${relevant.length}): ${relevant
            .slice(0, 3)
            .map((e) => `[${e.severity}] ${e.title.slice(0, 90)}`)
            .join("; ")}`
        );
      }
      parts.push("");
    }
  }

  // Section 2 — biggest movers from the watchlist
  const movers = [...ctx.stocks]
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5);
  parts.push(`### Top watchlist movers today`);
  movers.forEach((s) => {
    parts.push(
      `- ${s.sym} ${s.changePercent >= 0 ? "▲" : "▼"} ${s.changePercent.toFixed(2)}% — $${s.price.toFixed(2)}`
    );
  });
  parts.push("");

  // Section 3 — high-severity events
  const highEv = ctx.events.filter((e) => e.severity === "HIGH").slice(0, 5);
  if (highEv.length > 0) {
    parts.push(`### High-severity events on the radar`);
    highEv.forEach((e) => {
      parts.push(
        `- [${e.region}] ${e.title} — sectors: ${(e.affected_sectors as string[]).join(", ")}`
      );
    });
    parts.push("");
  }

  parts.push(
    `_This summary was generated locally — no LLM was consulted. Re-ask once Gemini is back to get a full structured analysis._`
  );
  return parts.join("\n");
}

function streamText(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const userTurn = [...messages].reverse().find((m) => m.role === "user");
  if (!userTurn) {
    return NextResponse.json(
      { error: "Provide at least one user message" },
      { status: 400 }
    );
  }

  const ctx = await buildChatContext(
    userTurn.content,
    body.ticker ? [body.ticker.toUpperCase()] : undefined
  );
  const contextText = renderContext(ctx);

  const client = getGeminiClient();

  // No API key → return a streamed offline analyst answer.
  if (!client) {
    return streamText(noKeyAnswer(userTurn.content, ctx, contextText));
  }

  // If every model is on cooldown, skip the network round-trips entirely and
  // serve the offline analyst answer immediately.
  const free = availableModels();
  if (free.length === 0) {
    return streamText(
      busyAnswer(
        userTurn.content,
        ctx,
        contextText,
        "Free-tier daily quota is exhausted across every fallback model."
      )
    );
  }

  // We send the live context as a synthetic user message so the assistant
  // always sees fresh data, then replay the chat history.
  const contents: Content[] = [
    {
      role: "user",
      parts: [
        {
          text: `LIVE CONTEXT BLOCK (do not echo back unless asked):\n\n${contextText}`,
        },
      ],
    },
    {
      role: "model",
      parts: [
        {
          text: "Acknowledged. Ready to answer the user's question using this live context.",
        },
      ],
    },
    ...messages.map<Content>((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
  ];

  // Try each non-cooled-down model in the chain until one accepts the request.
  let stream: AsyncIterable<{ text: () => string }> | null = null;
  let lastErr: unknown;

  for (const modelName of GEMINI_MODEL_CHAIN) {
    if (!free.includes(modelName)) continue;
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: { temperature: 0.5, maxOutputTokens: 1400 },
      });
      const generateReq: GenerateContentRequest = { contents };
      const result = await model.generateContentStream(generateReq);
      stream = result.stream;
      break;
    } catch (err) {
      lastErr = err;
      if (!isTransientGeminiError(err)) break;
      console.warn(`[api/chat] ${modelName} unavailable, trying next:`, err);
    }
  }

  if (!stream) {
    console.error("[api/chat] all models failed", lastErr);
    return streamText(
      busyAnswer(userTurn.content, ctx, contextText, shortReason(lastErr))
    );
  }

  const encoder = new TextEncoder();
  const out = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream!) {
          const text = chunk.text();
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        // Mid-stream failure: append a brief, clean note instead of dumping
        // the raw provider error JSON at the user.
        controller.enqueue(
          encoder.encode(`\n\n_${shortReason(err)} Showing what we had so far._`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(out, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
