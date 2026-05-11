import { NextResponse } from "next/server";
import {
  GEMINI_MODEL_CHAIN,
  getGeminiClient,
  isTransientGeminiError,
} from "@/lib/gemini";
import { buildChatContext, renderContext } from "@/lib/chatContext";
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

function noKeyAnswer(message: string, contextText: string): string {
  return [
    "## GeoStock AI — offline analyst (no Gemini key)",
    "",
    "I can't reach the language model right now (set `GEMINI_API_KEY` to enable live chat),",
    "but here is the snapshot the model would have used to answer your question:",
    "",
    "```",
    contextText,
    "```",
    "",
    `Your question was: _${message}_`,
  ].join("\n");
}

function busyAnswer(message: string, contextText: string, detail: string): string {
  return [
    "## Gemini is currently overloaded",
    "",
    `_${detail}_`,
    "",
    "Your question is queued in the UI history; tap **STOP** then resend in a moment.",
    "While the model is unavailable, here is the live snapshot I would have used:",
    "",
    "```",
    contextText,
    "```",
    "",
    `Your question was: _${message}_`,
  ].join("\n");
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
    headers: { "Content-Type": "text/plain; charset=utf-8" },
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

  // No API key → return a streamed fallback so the chat UI keeps working.
  if (!client) {
    return streamText(noKeyAnswer(userTurn.content, contextText));
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

  // Try each model in the fallback chain until one accepts the request.
  let stream: AsyncIterable<{ text: () => string }> | null = null;
  let lastErr: unknown;

  for (const modelName of GEMINI_MODEL_CHAIN) {
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
    const detail =
      lastErr instanceof Error ? lastErr.message : "unknown upstream error";
    return streamText(busyAnswer(userTurn.content, contextText, detail));
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
        controller.enqueue(
          encoder.encode(
            `\n\n_(stream error: ${
              err instanceof Error ? err.message : "unknown"
            })_`
          )
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
