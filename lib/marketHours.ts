/**
 * NYSE open/close indicator. Approximates the regular session in UTC:
 *   Mon–Fri, 14:30 → 21:00 UTC (= 09:30 → 16:00 ET, ignoring DST shifts).
 * Returns "OPEN", "PRE", "AFTER", or "CLOSED". Half-day holidays are not
 * modelled — this is a status badge, not a trading clock.
 */
export type MarketState = "OPEN" | "PRE" | "AFTER" | "CLOSED";

export function nyseState(date: Date = new Date()): {
  state: MarketState;
  label: string;
  nextChangeIso?: string;
} {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) {
    return { state: "CLOSED", label: "NYSE CLOSED" };
  }

  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const PRE_OPEN = 9 * 60; // 09:00 UTC
  const OPEN = 14 * 60 + 30; // 14:30 UTC
  const CLOSE = 21 * 60; // 21:00 UTC
  const AFTER_END = 24 * 60 + 60; // 01:00 UTC next day

  if (minutes < PRE_OPEN) {
    return { state: "CLOSED", label: "NYSE CLOSED" };
  }
  if (minutes < OPEN) {
    return { state: "PRE", label: "NYSE PRE-MARKET" };
  }
  if (minutes < CLOSE) {
    return { state: "OPEN", label: "NYSE OPEN" };
  }
  if (minutes < AFTER_END) {
    return { state: "AFTER", label: "NYSE AFTER-HOURS" };
  }
  return { state: "CLOSED", label: "NYSE CLOSED" };
}
