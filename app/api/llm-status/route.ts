import { NextResponse } from "next/server";
import {
  GEMINI_MODEL_CHAIN,
  availableModels,
  geminiAvailability,
} from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const unavailable = geminiAvailability();
  const free = availableModels();
  return NextResponse.json({
    ok: !unavailable,
    reason: unavailable?.reason ?? "ok",
    cooldowns: unavailable?.cooldowns ?? [],
    chain: GEMINI_MODEL_CHAIN,
    available: free,
    primary: free[0] ?? null,
  });
}
