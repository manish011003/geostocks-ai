/**
 * Lightweight, allocation-friendly technical indicators. All take a closes
 * array and return the latest value (or NaN if there isn't enough data).
 */

export function sma(closes: number[], period: number): number {
  if (closes.length < period) return NaN;
  let s = 0;
  for (let i = closes.length - period; i < closes.length; i++) s += closes[i];
  return s / period;
}

export function ema(closes: number[], period: number): number {
  if (closes.length < period) return NaN;
  const k = 2 / (period + 1);
  // Seed with SMA of the first `period` closes.
  let val = 0;
  for (let i = 0; i < period; i++) val += closes[i];
  val /= period;
  for (let i = period; i < closes.length; i++) {
    val = closes[i] * k + val * (1 - k);
  }
  return val;
}

/** Standard 14-period Wilder RSI. Returns 0–100, or NaN if insufficient data. */
export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return NaN;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Latest MACD reading (12,26,9). { macd, signal, hist } */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macd: number; signal: number; hist: number } {
  if (closes.length < slow + signalPeriod) {
    return { macd: NaN, signal: NaN, hist: NaN };
  }
  // Build full MACD-line history so we can EMA it for the signal line.
  const macdLine: number[] = [];
  const k_fast = 2 / (fast + 1);
  const k_slow = 2 / (slow + 1);

  let emaFast = 0;
  let emaSlow = 0;
  for (let i = 0; i < fast; i++) emaFast += closes[i];
  emaFast /= fast;
  for (let i = 0; i < slow; i++) emaSlow += closes[i];
  emaSlow /= slow;

  for (let i = 0; i < closes.length; i++) {
    if (i >= fast) emaFast = closes[i] * k_fast + emaFast * (1 - k_fast);
    if (i >= slow) emaSlow = closes[i] * k_slow + emaSlow * (1 - k_slow);
    if (i >= slow - 1) macdLine.push(emaFast - emaSlow);
  }

  const k_sig = 2 / (signalPeriod + 1);
  let sig = 0;
  for (let i = 0; i < signalPeriod; i++) sig += macdLine[i];
  sig /= signalPeriod;
  for (let i = signalPeriod; i < macdLine.length; i++) {
    sig = macdLine[i] * k_sig + sig * (1 - k_sig);
  }
  const last = macdLine[macdLine.length - 1];
  return { macd: last, signal: sig, hist: last - sig };
}

/** Annualised standard deviation of daily log returns, expressed in percent. */
export function realizedVolPct(closes: number[]): number {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 2) return NaN;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance =
    rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}
