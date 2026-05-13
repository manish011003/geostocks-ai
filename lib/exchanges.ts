/**
 * Multi-exchange registry, open/close detector, currency formatter, and
 * Yahoo Finance symbol helpers. This is the single source of truth for
 * everything exchange-aware in GeoStock AI v2.
 *
 * Timezone math uses the built-in `Intl.DateTimeFormat` API (Node 18+ and
 * every modern browser ship the full IANA tz database), so we don't pull
 * in `date-fns-tz` just for two helpers.
 */

export type ExchangeKey =
  | "NYSE"
  | "NASDAQ"
  | "BSE"
  | "NSE"
  | "LSE"
  | "TSE"
  | "SSE"
  | "EURONEXT";

export type ExchangeStatus =
  | "OPEN"
  | "CLOSED"
  | "PRE_MARKET"
  | "AFTER_HOURS"
  | "WEEKEND"
  | "HOLIDAY";

export type CurrencyCode =
  | "USD"
  | "INR"
  | "GBP"
  | "JPY"
  | "CNY"
  | "EUR";

export interface SessionWindow {
  open: string;
  close: string;
}

export interface ExchangeDef {
  key: ExchangeKey;
  name: string;
  country: string;
  flag: string;
  currency: CurrencyCode;
  /** Standard IANA timezone, e.g. "America/New_York". */
  timezone: string;
  /** Regular-session local open time, "HH:MM" (24h). */
  openTime: string;
  closeTime: string;
  /** ISO 10383 Market Identifier Code. */
  mic: string;
  /** Yahoo Finance suffix appended to bare tickers, "" for NYSE/NASDAQ. */
  suffix: string;
  /** Tailwind/CSS accent colour for badges and pills. */
  color: string;
  preMarket?: SessionWindow;
  afterHours?: SessionWindow;
  /** Centre point used by the globe focus animation. */
  globe: { lat: number; lon: number };
}

export const EXCHANGES: Record<ExchangeKey, ExchangeDef> = {
  NYSE: {
    key: "NYSE",
    name: "New York Stock Exchange",
    country: "United States",
    flag: "🇺🇸",
    currency: "USD",
    timezone: "America/New_York",
    openTime: "09:30",
    closeTime: "16:00",
    mic: "XNYS",
    suffix: "",
    color: "#4fc3f7",
    preMarket: { open: "04:00", close: "09:30" },
    afterHours: { open: "16:00", close: "20:00" },
    globe: { lat: 40.7, lon: -74.0 },
  },
  NASDAQ: {
    key: "NASDAQ",
    name: "NASDAQ",
    country: "United States",
    flag: "🇺🇸",
    currency: "USD",
    timezone: "America/New_York",
    openTime: "09:30",
    closeTime: "16:00",
    mic: "XNAS",
    suffix: "",
    color: "#4fc3f7",
    preMarket: { open: "04:00", close: "09:30" },
    afterHours: { open: "16:00", close: "20:00" },
    globe: { lat: 37.5, lon: -122.0 },
  },
  BSE: {
    key: "BSE",
    name: "Bombay Stock Exchange",
    country: "India",
    flag: "🇮🇳",
    currency: "INR",
    timezone: "Asia/Kolkata",
    openTime: "09:15",
    closeTime: "15:30",
    mic: "XBOM",
    suffix: ".BO",
    color: "#ff9800",
    globe: { lat: 19.0, lon: 72.8 },
  },
  NSE: {
    key: "NSE",
    name: "National Stock Exchange of India",
    country: "India",
    flag: "🇮🇳",
    currency: "INR",
    timezone: "Asia/Kolkata",
    openTime: "09:15",
    closeTime: "15:30",
    mic: "XNSE",
    suffix: ".NS",
    color: "#ff9800",
    globe: { lat: 19.0, lon: 72.8 },
  },
  LSE: {
    key: "LSE",
    name: "London Stock Exchange",
    country: "United Kingdom",
    flag: "🇬🇧",
    currency: "GBP",
    timezone: "Europe/London",
    openTime: "08:00",
    closeTime: "16:30",
    mic: "XLON",
    suffix: ".L",
    color: "#ce93d8",
    globe: { lat: 51.5, lon: -0.1 },
  },
  TSE: {
    key: "TSE",
    name: "Tokyo Stock Exchange",
    country: "Japan",
    flag: "🇯🇵",
    currency: "JPY",
    timezone: "Asia/Tokyo",
    openTime: "09:00",
    closeTime: "15:30",
    mic: "XTKS",
    suffix: ".T",
    color: "#f48fb1",
    globe: { lat: 35.7, lon: 139.7 },
  },
  SSE: {
    key: "SSE",
    name: "Shanghai Stock Exchange",
    country: "China",
    flag: "🇨🇳",
    currency: "CNY",
    timezone: "Asia/Shanghai",
    openTime: "09:30",
    closeTime: "15:00",
    mic: "XSHG",
    suffix: ".SS",
    color: "#ef5350",
    globe: { lat: 31.2, lon: 121.5 },
  },
  EURONEXT: {
    key: "EURONEXT",
    name: "Euronext Paris",
    country: "France / EU",
    flag: "🇪🇺",
    currency: "EUR",
    timezone: "Europe/Paris",
    openTime: "09:00",
    closeTime: "17:30",
    mic: "XPAR",
    suffix: ".PA",
    color: "#81c784",
    globe: { lat: 48.9, lon: 2.3 },
  },
};

export const EXCHANGE_KEYS = Object.keys(EXCHANGES) as ExchangeKey[];

/** Selector model used by the top-of-watchlist pill row + filter logic. */
export interface ExchangeOption {
  key: ExchangeKey | "ALL";
  label: string;
  flag: string;
}

export const EXCHANGE_OPTIONS: ExchangeOption[] = [
  { key: "ALL", label: "All", flag: "🌍" },
  { key: "NYSE", label: "NYSE", flag: "🇺🇸" },
  { key: "NASDAQ", label: "NASDAQ", flag: "🇺🇸" },
  { key: "BSE", label: "BSE", flag: "🇮🇳" },
  { key: "NSE", label: "NSE", flag: "🇮🇳" },
  { key: "LSE", label: "LSE", flag: "🇬🇧" },
  { key: "TSE", label: "TSE", flag: "🇯🇵" },
  { key: "SSE", label: "SSE", flag: "🇨🇳" },
  { key: "EURONEXT", label: "EU", flag: "🇪🇺" },
];

// ===========================================================================
// Timezone math
// ===========================================================================

/**
 * Read the calendar fields (year/month/day/hour/min/weekday) for `instant`
 * **as observed in `timezone`**. Uses `Intl.DateTimeFormat`, which is built
 * on the full IANA database and so handles DST automatically.
 *
 * We avoid `formatToParts(...)` allocating a fresh formatter every call by
 * caching one per timezone.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();
function fmtFor(timezone: string): Intl.DateTimeFormat {
  let f = FORMATTERS.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    FORMATTERS.set(timezone, f);
  }
  return f;
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  /** 0=Sun, 1=Mon, ..., 6=Sat — matches JS Date.getDay() */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function localPartsAt(timezone: string, instant: Date = new Date()): LocalParts {
  const parts = fmtFor(timezone).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  let hour = parseInt(map.hour ?? "0", 10);
  if (hour === 24) hour = 0; // Intl quirk: midnight can come back as "24"
  return {
    year: parseInt(map.year ?? "0", 10),
    month: parseInt(map.month ?? "0", 10),
    day: parseInt(map.day ?? "0", 10),
    hour,
    minute: parseInt(map.minute ?? "0", 10),
    weekday: WEEKDAY_INDEX[map.weekday ?? "Sun"] ?? 0,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function fmtCountdown(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh === 0 ? `${d}d` : `${d}d ${hh}h`;
}

// ===========================================================================
// Status engine
// ===========================================================================

export interface ExchangeStatusResult {
  exchange: ExchangeKey;
  status: ExchangeStatus;
  label: string;
  color: string;
  /** Local "HH:MM" at the exchange right now. */
  localTime: string;
  /** Short human countdown, e.g. "Opens in 2h 14m". */
  nextEvent: string;
  /** 0-100 — how far through the regular session we are (0 outside). */
  sessionProgress: number;
}

const STATUS_COLOR: Record<ExchangeStatus, string> = {
  OPEN: "#00e676",
  PRE_MARKET: "#ffb74d",
  AFTER_HOURS: "#ff9800",
  CLOSED: "#ff5252",
  WEEKEND: "#5a7a9e",
  HOLIDAY: "#9c8cff",
};

/**
 * Returns the live status of `exchangeKey` from the perspective of the
 * exchange's local timezone, including a countdown to the next open or
 * close. Weekend + holiday detection is best-effort: we treat Sat/Sun as
 * WEEKEND but do not currently maintain a per-exchange holiday calendar.
 */
export function getExchangeStatus(
  exchangeKey: ExchangeKey,
  now: Date = new Date()
): ExchangeStatusResult {
  const ex = EXCHANGES[exchangeKey];
  const local = localPartsAt(ex.timezone, now);
  const localTime = `${pad2(local.hour)}:${pad2(local.minute)}`;
  const nowMins = local.hour * 60 + local.minute;
  const openMins = toMinutes(ex.openTime);
  const closeMins = toMinutes(ex.closeTime);
  const preOpenMins = ex.preMarket ? toMinutes(ex.preMarket.open) : null;
  const preCloseMins = ex.preMarket ? toMinutes(ex.preMarket.close) : null;
  const afterOpenMins = ex.afterHours ? toMinutes(ex.afterHours.open) : null;
  const afterCloseMins = ex.afterHours ? toMinutes(ex.afterHours.close) : null;

  const isWeekend = local.weekday === 0 || local.weekday === 6;

  if (isWeekend) {
    // Countdown to Monday's open. weekday 6=Sat → 2 days away, 0=Sun → 1 day.
    const daysToMonday = local.weekday === 6 ? 2 : 1;
    const minsLeftToday = 24 * 60 - nowMins;
    const totalMins = minsLeftToday + (daysToMonday - 1) * 24 * 60 + openMins;
    return {
      exchange: exchangeKey,
      status: "WEEKEND",
      label: "Weekend",
      color: STATUS_COLOR.WEEKEND,
      localTime,
      nextEvent: `Opens in ${fmtCountdown(totalMins)}`,
      sessionProgress: 0,
    };
  }

  // Regular session
  if (nowMins >= openMins && nowMins < closeMins) {
    const minsLeft = closeMins - nowMins;
    const progress = ((nowMins - openMins) / (closeMins - openMins)) * 100;
    return {
      exchange: exchangeKey,
      status: "OPEN",
      label: "Open",
      color: STATUS_COLOR.OPEN,
      localTime,
      nextEvent: `Closes in ${fmtCountdown(minsLeft)}`,
      sessionProgress: Math.round(Math.min(100, Math.max(0, progress))),
    };
  }

  // Pre-market
  if (
    preOpenMins !== null &&
    preCloseMins !== null &&
    nowMins >= preOpenMins &&
    nowMins < preCloseMins
  ) {
    const minsLeft = openMins - nowMins;
    return {
      exchange: exchangeKey,
      status: "PRE_MARKET",
      label: "Pre-Market",
      color: STATUS_COLOR.PRE_MARKET,
      localTime,
      nextEvent: `Opens in ${fmtCountdown(minsLeft)}`,
      sessionProgress: 0,
    };
  }

  // After-hours
  if (
    afterOpenMins !== null &&
    afterCloseMins !== null &&
    nowMins >= afterOpenMins &&
    nowMins < afterCloseMins
  ) {
    const minsLeft = afterCloseMins - nowMins;
    return {
      exchange: exchangeKey,
      status: "AFTER_HOURS",
      label: "After Hours",
      color: STATUS_COLOR.AFTER_HOURS,
      localTime,
      nextEvent: `Closes in ${fmtCountdown(minsLeft)}`,
      sessionProgress: 0,
    };
  }

  // Closed. Compute mins to the next regular open: tomorrow if past close
  // today (or weekend rollover), otherwise later today.
  let minsToOpen: number;
  if (nowMins < openMins) {
    minsToOpen = openMins - nowMins;
  } else {
    // After-close today. Tomorrow's weekday:
    const tomorrowWeekday = (local.weekday + 1) % 7;
    let daysToOpen = 1;
    if (tomorrowWeekday === 0) daysToOpen = 2; // Sat → Mon
    else if (tomorrowWeekday === 6) daysToOpen = 3; // Fri → Mon
    minsToOpen = 24 * 60 - nowMins + (daysToOpen - 1) * 24 * 60 + openMins;
  }
  return {
    exchange: exchangeKey,
    status: "CLOSED",
    label: "Closed",
    color: STATUS_COLOR.CLOSED,
    localTime,
    nextEvent: `Opens in ${fmtCountdown(minsToOpen)}`,
    sessionProgress: 0,
  };
}

/** Aggregate status for every exchange. Cheap (~8 Intl.format calls). */
export function getAllExchangeStatuses(
  now: Date = new Date()
): Record<ExchangeKey, ExchangeStatusResult> {
  const out = {} as Record<ExchangeKey, ExchangeStatusResult>;
  for (const k of EXCHANGE_KEYS) out[k] = getExchangeStatus(k, now);
  return out;
}

// ===========================================================================
// Currency
// ===========================================================================

const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  USD: "en-US",
  INR: "en-IN",
  GBP: "en-GB",
  JPY: "ja-JP",
  CNY: "zh-CN",
  EUR: "de-DE",
};

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  USD: "$",
  INR: "₹",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  EUR: "€",
};

const PRICE_FORMATTERS = new Map<string, Intl.NumberFormat>();
function priceFormatter(currency: CurrencyCode): Intl.NumberFormat {
  let f = PRICE_FORMATTERS.get(currency);
  if (!f) {
    const isJPY = currency === "JPY";
    f = new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
      style: "currency",
      currency,
      minimumFractionDigits: isJPY ? 0 : 2,
      maximumFractionDigits: isJPY ? 0 : 2,
    });
    PRICE_FORMATTERS.set(currency, f);
  }
  return f;
}

/** Currency-correct price formatter used everywhere. Unknown currencies
 *  fall back to USD. */
export function formatPrice(
  price: number | null | undefined,
  currency: string | null | undefined
): string {
  if (price === null || price === undefined || !Number.isFinite(price)) return "—";
  const c = (currency || "USD").toUpperCase() as CurrencyCode;
  const safe = (CURRENCY_SYMBOL[c] ? c : "USD") as CurrencyCode;
  return priceFormatter(safe).format(price);
}

/** Compact symbol-only formatter, used inside tight cells (ticker tape, rows). */
export function currencySymbol(currency: string | null | undefined): string {
  if (!currency) return "$";
  const c = currency.toUpperCase() as CurrencyCode;
  return CURRENCY_SYMBOL[c] ?? "$";
}

/** "Compact" price for narrow chips. Drops thousand separators above 1k. */
export function formatPriceCompact(
  price: number | null | undefined,
  currency: string | null | undefined
): string {
  if (price === null || price === undefined || !Number.isFinite(price)) return "—";
  const c = (currency || "USD").toUpperCase() as CurrencyCode;
  const sym = currencySymbol(c);
  const isJPY = c === "JPY";
  if (price >= 1000) {
    return `${sym}${price.toLocaleString(undefined, {
      maximumFractionDigits: isJPY ? 0 : 1,
    })}`;
  }
  return `${sym}${price.toFixed(isJPY ? 0 : 2)}`;
}

// ===========================================================================
// Yahoo Finance symbol helpers
// ===========================================================================

/** Build the Yahoo Finance ticker for a bare symbol + exchange (e.g.
 *  "RELIANCE" on "BSE" → "RELIANCE.BO"). NYSE/NASDAQ have no suffix. */
export function buildYahooSymbol(sym: string, exchange?: string | null): string {
  if (!exchange) return sym;
  const key = exchange.toUpperCase() as ExchangeKey;
  const ex = EXCHANGES[key];
  if (!ex || !ex.suffix) return sym;
  // Don't double-suffix
  if (sym.toUpperCase().endsWith(ex.suffix.toUpperCase())) return sym;
  return `${sym}${ex.suffix}`;
}

/** Strip a Yahoo suffix off if present (e.g. "RELIANCE.NS" → "RELIANCE"). */
export function stripYahooSuffix(sym: string): string {
  return sym.replace(/\.(BO|NS|L|T|SS|PA|HK|TO|AX|DE)$/i, "");
}

/** Detect an exchange from a Yahoo symbol's suffix. Defaults to NYSE for
 *  bare US tickers. Returns null if the symbol clearly isn't on one of the
 *  supported exchanges (e.g. ".HK", ".TO"), so callers can drop or default. */
export function detectExchangeFromYahooSymbol(sym: string): ExchangeKey | null {
  const upper = sym.toUpperCase();
  if (upper.endsWith(".BO")) return "BSE";
  if (upper.endsWith(".NS")) return "NSE";
  if (upper.endsWith(".L")) return "LSE";
  if (upper.endsWith(".T")) return "TSE";
  if (upper.endsWith(".SS")) return "SSE";
  if (upper.endsWith(".PA")) return "EURONEXT";
  if (/^\d/.test(upper)) {
    // Asian numeric tickers without suffix — rare via Yahoo but be lenient
    if (upper.length === 4) return "TSE";
    if (upper.length === 6) return "SSE";
  }
  if (/\.[A-Z]+$/i.test(upper)) {
    // Unknown non-US exchange suffix — caller decides.
    return null;
  }
  return "NYSE";
}

/** Loose mapping from Yahoo's `exchDisp`/`exchange` field → our ExchangeKey.
 *  Used by search to label results. Returns null when there's no good match. */
export function exchangeKeyFromYahooExchange(exch: string | undefined): ExchangeKey | null {
  if (!exch) return null;
  const e = exch.toUpperCase();
  if (e.includes("NMS") || e.includes("NASDAQ") || e.includes("NCM")) return "NASDAQ";
  if (e.includes("NYQ") || e.includes("NYSE") || e.includes("ARCA") || e.includes("BATS"))
    return "NYSE";
  if (e.includes("BSE") || e.includes("BOM")) return "BSE";
  if (e.includes("NSE") || e.includes("NSI")) return "NSE";
  if (e.includes("LSE") || e.includes("LON")) return "LSE";
  if (e.includes("TYO") || e.includes("JPX") || e.includes("TSE")) return "TSE";
  if (e.includes("SHA") || e.includes("SHH") || e.includes("SHG")) return "SSE";
  if (e.includes("PAR") || e.includes("EPA")) return "EURONEXT";
  return null;
}

// ===========================================================================
// Default seed watchlists per exchange
// ===========================================================================

export interface DefaultStock {
  sym: string;
  name: string;
  sector: string;
}

export const DEFAULT_STOCKS: Record<ExchangeKey, DefaultStock[]> = {
  NYSE: [
    { sym: "XOM", name: "ExxonMobil", sector: "energy" },
    { sym: "LMT", name: "Lockheed Martin", sector: "defense" },
    { sym: "CVX", name: "Chevron", sector: "energy" },
    { sym: "BA", name: "Boeing", sector: "defense" },
    { sym: "GS", name: "Goldman Sachs", sector: "finance" },
  ],
  NASDAQ: [
    { sym: "AAPL", name: "Apple Inc.", sector: "tech" },
    { sym: "TSLA", name: "Tesla Inc.", sector: "ev" },
    { sym: "NVDA", name: "Nvidia", sector: "tech" },
    { sym: "MSFT", name: "Microsoft", sector: "tech" },
    { sym: "AMZN", name: "Amazon", sector: "tech" },
  ],
  BSE: [
    { sym: "RELIANCE", name: "Reliance Industries", sector: "energy" },
    { sym: "TCS", name: "Tata Consultancy", sector: "tech" },
    { sym: "HDFCBANK", name: "HDFC Bank", sector: "finance" },
    { sym: "INFY", name: "Infosys", sector: "tech" },
    { sym: "ICICIBANK", name: "ICICI Bank", sector: "finance" },
    { sym: "HINDUNILVR", name: "Hindustan Unilever", sector: "consumer" },
    { sym: "WIPRO", name: "Wipro", sector: "tech" },
  ],
  NSE: [
    { sym: "TATAMOTORS", name: "Tata Motors", sector: "auto" },
    { sym: "BAJFINANCE", name: "Bajaj Finance", sector: "finance" },
    { sym: "ADANIENT", name: "Adani Enterprises", sector: "conglomerate" },
    { sym: "SUNPHARMA", name: "Sun Pharma", sector: "pharma" },
    { sym: "SBIN", name: "State Bank of India", sector: "finance" },
  ],
  LSE: [
    { sym: "SHEL", name: "Shell", sector: "energy" },
    { sym: "BP", name: "BP", sector: "energy" },
    { sym: "HSBA", name: "HSBC", sector: "finance" },
    { sym: "AZN", name: "AstraZeneca", sector: "pharma" },
    { sym: "VOD", name: "Vodafone", sector: "telecom" },
  ],
  TSE: [
    { sym: "7203", name: "Toyota", sector: "auto" },
    { sym: "9984", name: "SoftBank Group", sector: "tech" },
    { sym: "6758", name: "Sony", sector: "tech" },
    { sym: "9432", name: "NTT", sector: "telecom" },
  ],
  SSE: [
    { sym: "600519", name: "Kweichow Moutai", sector: "consumer" },
    { sym: "601398", name: "ICBC", sector: "finance" },
    { sym: "600036", name: "China Merchants Bank", sector: "finance" },
  ],
  EURONEXT: [
    { sym: "MC", name: "LVMH", sector: "luxury" },
    { sym: "TTE", name: "TotalEnergies", sector: "energy" },
    { sym: "SAN", name: "Sanofi", sector: "pharma" },
    { sym: "AI", name: "Air Liquide", sector: "industrial" },
  ],
};

/** Flat enriched list — used by the API to fetch "ALL" in one go. */
export function allDefaultStocks(): Array<DefaultStock & { exchange: ExchangeKey }> {
  return EXCHANGE_KEYS.flatMap((ex) =>
    DEFAULT_STOCKS[ex].map((s) => ({ ...s, exchange: ex }))
  );
}

/** Resolve a stock to its preferred exchange when none is set. Conservative:
 *  bare symbol on a known US ticker → NASDAQ if it's in the seed list, else
 *  NYSE. */
const _NASDAQ_SYMS = new Set(DEFAULT_STOCKS.NASDAQ.map((s) => s.sym.toUpperCase()));
export function resolveExchange(
  sym: string,
  hint?: string | null
): ExchangeKey {
  if (hint) {
    const k = hint.toUpperCase() as ExchangeKey;
    if (EXCHANGES[k]) return k;
  }
  const detected = detectExchangeFromYahooSymbol(sym);
  if (detected) return detected;
  return _NASDAQ_SYMS.has(sym.toUpperCase()) ? "NASDAQ" : "NYSE";
}
