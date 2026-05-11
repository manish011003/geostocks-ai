<div align="center">

# GeoStock AI

**Geopolitical stock intelligence in your browser.**
A live 3-D globe, multi-list watchlist, AI-tagged news feed, and a streaming
analyst chatbot — all in a single Next.js dashboard.

[Quick start](#-quick-start) ·
[Features](#-features) ·
[Architecture](#-architecture) ·
[API](#-api) ·
[Contributing](#-contributing) ·
[Roadmap](#-roadmap)

</div>

---

## What is this?

GeoStock AI links world events to market moves in real time. It pulls live
prices, geopolitical headlines, and historical OHLCV, lets Google Gemini tag
each headline with a severity / region / sector, then plots the result on a
realtime-lit Three.js globe. Click any event and the camera flies to the
location, a pulse ring expands on the marker, and a structured analysis panel
slides up with affected stocks, sectors, and likely market impact. Click any
ticker (in your watchlist, the ticker tape, or an event panel) and a 480px
detail drawer slides in with a candlestick chart, a 5-signal AI prediction, and
the news events tied to that sector.

Everything works **without API keys** — fallbacks ship curated headlines and
heuristic taggers so the UI is never blank. Add a free Gemini / GNews key for
the live experience.

## ✨ Features

### Globe & geopolitical intelligence
- **Day/night-blended Earth** rendered with a custom GLSL shader; the
  subsolar point is computed from the wall clock so daylight matches reality.
- **Brightened night side** with city lights layered on top of a tinted day
  texture, so continents stay legible everywhere on the globe.
- **Pulsing severity markers** (red / amber / green) for every tagged event,
  with hover tooltips and a click-to-focus interaction.
- **Camera fly-to + ring highlight** when you click an event in the right feed
  or the map — animated with GSAP over 1.2 s.
- **Event detail panel** slides up from the bottom with a Gemini-generated
  summary, background, market impact, affected tickers (clickable), sectors,
  severity reason, and timeline.

### News
- Five **regional GNews queries fanned out in parallel** so you always get a
  globally-balanced mix (Middle East / US policy / Latin America / Europe /
  Africa-India-China), then deduped by normalised title.
- **Filter bar** with multi-select sector pills, severity pills, and a
  region quick-jump that maps Gemini's specific regions into top-level
  buckets (Americas / Europe / Asia / etc.).
- **Toast notifications** (`react-hot-toast`) for new HIGH-severity events;
  click the toast to focus the globe + open the detail panel.

### Watchlist & stock detail
- **Multi-list watchlist** with default **Watchlist / Commodities / Defense**
  tabs plus a `+` button to create your own. Up to 20 stocks per list.
- **Drag to reorder** (`@dnd-kit`), hover to remove with `×`, all persisted
  to `localStorage` via Zustand.
- **Global stock search** — type any symbol or company and pick from
  Yahoo-Finance results grouped by country, with flag emojis and exchange
  badges. One click adds to the active list.
- **Stock detail drawer** with three tabs:
  - **Chart** — 1W / 1M / 3M / 6M / 1Y candlestick + volume + RSI panes
    powered by `lightweight-charts`.
  - **AI Prediction** — composite-score gauge, BULLISH / BEARISH / NEUTRAL
    badge, confidence bar, 5-row signal-breakdown table, Gemini reasoning
    bullets, trigger chips, and a vol-scaled 7-day price target.
  - **Related Events** — events tagged with this stock's sector.

### AI prediction engine
A weighted composite of 5 independent signals:

| Signal              | Weight | Source                                                            |
| ------------------- | ------ | ----------------------------------------------------------------- |
| News sentiment      | 30 %   | sector-relevant headlines × severity bias                         |
| Technical           | 25 %   | RSI(14) + MACD(12,26,9) + 20-day SMA from Yahoo OHLCV             |
| Regional risk delta | 20 %   | recent-vs-older HIGH events, with safe-haven inversion            |
| Sector correlation  | 15 %   | event-type → sector impact map                                    |
| Volatility          | 10 %   | annualised σ of daily log returns                                 |

Final composite is clamped to ±100, mapped to a direction at ±15, and
confidence is `min(95, |composite| + vol_bonus)`. Reasoning + key triggers are
narrated by Gemini and price targets are scaled by realised volatility.

### Streaming analyst chatbot
- Streams responses from Gemini via `ReadableStream`; tokens render
  progressively with a tiny custom Markdown renderer (no `dangerouslySetInnerHTML`).
- Fresh **LIVE CONTEXT** block on every turn: current watchlist quotes,
  AI-tagged events, and 1-year OHLC summary for any ticker mentioned.
- Auto-detects tickers in the user's question; falls back to a graceful
  context-only answer when Gemini is overloaded.
- Open / close with `Ctrl/Cmd + K` or the floating **ASK AI** button.

### Settings & UX polish
- **Settings drawer** (gear icon, top-right) — Appearance (theme, globe
  texture, ticker speed, default chart timeframe), Data & Refresh
  intervals, Globe options (auto-rotate, speed slider, markers, pulse),
  Notifications (HIGH alerts + price-alert %), Data Management (CSV
  export, reset, clear cache), and a User Profile (display name + JSON
  export/import). Persisted via `zustand/middleware/persist`.
- **Theme system** with dark / light / **auto** (follows
  `prefers-color-scheme`); the bootstrap script applies the theme before
  paint to avoid FOUC.
- **NYSE OPEN / PRE / AFTER / CLOSED** pill in the bottom legend, plus the
  live subsolar lat/lon.
- Skeleton shimmer loaders, hover-only drag handles + remove buttons,
  click-anywhere-outside-to-close drawers.

## 🚀 Quick start

```bash
git clone https://github.com/<your-fork>/geostock.git
cd geostock
npm install
cp .env.example .env.local      # paste your keys here
npm run dev                     # → http://localhost:3000
```

Or with the keys already in your shell:

```bash
GEMINI_API_KEY=… GNEWS_API_KEY=… npm run dev
```

The dashboard runs **without API keys**. With no Gemini key, news is tagged
heuristically and the chatbot returns a context-only summary. With no GNews
or NewsAPI key, a curated offline event sample is shown.

### Free API sign-ups

| Provider     | Purpose                          | Free tier limit          | Sign-up                                  |
| ------------ | -------------------------------- | ------------------------ | ---------------------------------------- |
| Google Gemini | Severity tagging + AI analysis  | Generous free tier       | https://aistudio.google.com/app/apikey   |
| GNews        | Live geopolitical headlines      | 100 req/day              | https://gnews.io                         |
| NewsAPI      | Fallback when GNews is exhausted | 100 req/day              | https://newsapi.org                      |
| Yahoo Finance | Quotes + history + search       | Unauthenticated          | n/a                                      |

## 🧱 Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js 16 · App Router · React 19 · TypeScript · Tailwind v4       │
├──────────────────────────────────────────────────────────────────────┤
│  app/page.tsx        ← orchestrates state, fetch loops, drawers      │
│  components/Globe.tsx ← Three.js scene, day/night shader, GSAP focus │
│  components/StockDrawer.tsx + CandlestickChart.tsx (lightweight-charts)
│  components/SettingsDrawer.tsx, EventDetailPanel.tsx, NewsFilters.tsx │
│  components/Watchlist.tsx (@dnd-kit) + StockSearch.tsx                │
│  components/Chatbot.tsx + AskAIButton.tsx                             │
├──────────────────────────────────────────────────────────────────────┤
│  lib/                                                                 │
│    gemini.ts        ← Gemini SDK + multi-model fallback chain         │
│    news.ts          ← 5-region fan-out + dedupe                       │
│    stocks.ts        ← Yahoo Finance quotes + OHLCV history            │
│    technical.ts     ← RSI, MACD, SMA, realised vol                    │
│    settings.ts      ← Zustand persist store (UI prefs)                │
│    watchlists.ts    ← Zustand persist store (multi-list)              │
│    marketHours.ts   ← NYSE open/closed indicator                      │
│    geo.ts, sun.ts   ← lat/lon ↔ Vec3, subsolar position               │
│    cache.ts         ← in-memory TTL cache                             │
├──────────────────────────────────────────────────────────────────────┤
│  app/api/*                                                            │
│    GET  /api/stocks?symbols=…   Yahoo Finance batch quotes            │
│    GET  /api/history?symbol=…   OHLCV bars + rolling RSI series       │
│    GET  /api/news               GNews fan-out + Gemini tagger         │
│    GET  /api/search-stock?q=…   Yahoo Finance global search           │
│    POST /api/analyze            5-signal composite prediction         │
│    POST /api/event-detail       Structured Gemini event analysis      │
│    POST /api/chat               Streaming Gemini chatbot              │
└──────────────────────────────────────────────────────────────────────┘
```

### Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Three.js** raw (no `react-three-fiber`) + **GSAP** for camera + ring tweens
- **lightweight-charts** for the candlestick / volume / RSI panes
- **@dnd-kit** for accessible drag-and-drop in the watchlist
- **Zustand** + `persist` middleware for client state in `localStorage`
- **react-hot-toast** for non-blocking notifications
- **Tailwind v4** + custom CSS variables for the dark / light theme system
- **Google Gemini** (`gemini-2.5-flash` → `gemini-2.0-flash` →
  `gemini-flash-latest` fallback chain) for tagging, analysis, and chat

### Resilience

- Every external call has a fallback: GNews → NewsAPI → curated sample;
  Gemini model A → B → C → heuristic tagger; Yahoo → synthetic quote.
- The Gemini wrapper detects transient 5xx / quota errors and retries against
  the next model in the chain.
- The chatbot streams a graceful "context-only" summary if every model is
  overloaded, instead of returning a 500.
- An in-memory TTL cache (60 s for quotes, 5 m for predictions, 10 m for news)
  keeps the dev / single-instance experience snappy and within free-tier limits.

## 📡 API

### `GET /api/stocks?symbols=AAPL,TSLA,…`

Live quotes for an arbitrary symbol list (defaults to the curated watchlist).

```jsonc
{
  "stocks": [
    {
      "sym": "AAPL", "name": "Apple Inc.", "sector": "tech",
      "price": 187.65, "change": 1.21, "changePercent": 0.65,
      "currency": "USD", "sparkline": [183.2, 184.1, /* … */ ]
    }
  ],
  "cached": false
}
```

### `GET /api/history?symbol=AAPL&range=3mo`

OHLCV bars + a rolling RSI series for the candlestick chart.
Supported ranges: `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`.

### `GET /api/news`

Tagged geopolitical events. Each event includes `severity`, `region`,
`lat`, `lon`, `affected_sectors`, `summary`, and source metadata.

### `GET /api/search-stock?q=NVDA`

Yahoo-Finance global search. Returns up to 8 results with `flag`, `country`,
`exchange`, `type`, and `sector`.

### `POST /api/analyze`  ·  `{ ticker: "LMT" }`

5-signal composite prediction:

```jsonc
{
  "ticker": "LMT",
  "composite_score": 23.4,
  "direction": "BULLISH",
  "confidence": 41,
  "signals": {
    "news":          { "score":  18, "weight": 0.30, "detail": { "headlines_analyzed": 4 } },
    "technical":     { "score":  42, "weight": 0.25, "detail": { "rsi": 61.2, "macd": 1.8, "macd_signal": 1.6, "sma20": 412.1, "price_vs_sma20": "above" } },
    "regional_risk": { "score":  36, "weight": 0.20, "detail": { "recent_high_severity": 3, "older_high_severity": 1, "sector_bias": "safe-haven" } },
    "sector":        { "score":  60, "weight": 0.15, "detail": { "sector": "defense", "event_breakdown": ["military_conflict: +80"] } },
    "volatility":    { "score": -10, "weight": 0.10, "detail": { "realized_vol_pct": 28.3 } }
  },
  "reasoning": ["…", "…"],
  "key_triggers": ["military_conflict", "defense"],
  "price_target_range": { "low": 411.2, "high": 438.9, "timeframe": "7d" },
  "current_price": 425.07
}
```

### `POST /api/event-detail`  ·  `{ id, title, region, severity, source, url }`

Structured Gemini analysis of a single event (summary, background,
market_impact, affected_stocks, affected_sectors, severity_reason,
timeline, sources).

### `POST /api/chat`  ·  streaming

```jsonc
{ "messages": [{ "role": "user", "content": "Predict LMT for the next 3 months." }] }
```

Returns a `text/plain` stream of markdown chunks. Each request rebuilds a
LIVE CONTEXT block from the watchlist, current events, and 1-year OHLC for
detected tickers.

### Curl smoke tests

```bash
curl http://localhost:3000/api/stocks
curl 'http://localhost:3000/api/search-stock?q=NVDA'
curl 'http://localhost:3000/api/history?symbol=NVDA&range=3mo'
curl http://localhost:3000/api/news

curl -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' -d '{"ticker":"LMT"}'

curl -N -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"What's the macro setup for NVDA?"}]}'
```

## ⌨️ Keyboard shortcuts

| Shortcut          | Action                                |
| ----------------- | ------------------------------------- |
| `Ctrl/Cmd + K`    | Toggle the AI chatbot                 |
| `Esc`             | Close chat → drawer → settings → event panel (in that order) |
| Click ticker tape | Open stock detail drawer              |
| Click globe marker | Fly camera + open event panel        |

## 🛠️ Production build

```bash
npm run build       # Next.js production build (Turbopack)
npm start           # serve the build on :3000
```

## 🤝 Contributing

**This is an indie project and contributions are very welcome.** Whether
you're filing a bug, polishing the UI, or shipping a brand-new panel, you
have a place here. No issue is too small.

### Good first issues

If you're looking for somewhere to start, any of these are self-contained:

- 🌐 **Add more regional flags** to `app/api/search-stock/route.ts`
  (`flagForExchange`) — Singapore, Israel, UAE, Switzerland, etc.
- 🎨 **Skeleton loaders** for the stock-drawer chart while it transitions
  between time ranges.
- 📊 **MACD pane** in `CandlestickChart.tsx` (it currently only renders
  RSI + volume; the MACD calc already exists in `lib/technical.ts`).
- 🌎 **Country borders overlay** when the "Show country borders" setting is
  on (currently a no-op toggle in `SettingsDrawer.tsx`).
- 🔔 **Browser Notification API** for HIGH-severity alerts when the tab is
  in the background.
- 🇪🇺 **Multi-currency display** — when "Currency display" is set to "Local",
  fetch FX rates and translate non-USD watchlist quotes.
- 📱 **Mobile layout** — the 3-column grid collapses to one column under
  900 px but the drawers still need polish.
- ✅ Add **unit tests** for `lib/technical.ts` (RSI / MACD / SMA / vol)
  and `lib/news.ts` (`deduplicateByTitle`).

Pick one, comment on the issue (or open one), and go. If you'd like to be
assigned but aren't sure where to begin, just ask — we'll pair on it.

### Local dev workflow

1. Fork the repo and create a topic branch:
   ```bash
   git checkout -b feat/my-thing
   ```
2. Install dependencies (`npm install`) and run the dev server (`npm run dev`).
3. Make your changes. Try to keep PRs focused — one feature or one fix per PR.
4. Verify things still build:
   ```bash
   npx tsc --noEmit -p .   # type check
   npm run build           # production build
   npm run lint            # ESLint (if configured)
   ```
5. Commit with a short, imperative subject line:
   ```
   feat(globe): add country-borders overlay
   fix(news): dedupe titles with smart-quote variants
   docs(readme): document /api/event-detail
   ```
6. Push your branch and open a PR. Describe what you changed and why,
   and include screenshots / GIFs for any UI changes — they really help.

### Code style

- **TypeScript strict mode** — no `any` unless absolutely necessary.
- **No new dependencies** without a quick justification in the PR
  description (we try to keep the bundle lean).
- **Prefer existing CSS variables** (`var(--blue)`, `var(--surface)`, etc.)
  so dark / light mode keeps working.
- **All external calls must have a fallback** — the dashboard should never
  go blank because an upstream API is down.
- **Comments explain *why*, not *what***. The code already says what.

### Writing a new feature

Most features touch a similar set of files:

```
lib/<feature>.ts            ← pure data / utility logic + types
app/api/<feature>/route.ts  ← server-side glue, caching, fallbacks
components/<Feature>.tsx    ← client UI, reads from /api or Zustand
app/page.tsx                ← wire in the new state and props
app/globals.css             ← styles (use existing CSS vars)
```

Look at any of the existing trios (e.g. `lib/technical.ts` →
`app/api/analyze/route.ts` → `components/StockDrawer.tsx`) for the pattern.

### Reporting bugs

Please include:

1. What you did and what you expected to happen.
2. What actually happened (screenshot or paste of the console / network tab
   if it's UI / network related).
3. Your OS, Node version, and whether `GEMINI_API_KEY` / `GNEWS_API_KEY` were
   set.

### Code of conduct

Be kind. Assume good faith. We're all here because we like building things
that show how the world is moving — let's keep it a good place to do that.

## 🗺️ Roadmap

Things we'd love to ship next (PRs welcome on any of these):

- [ ] WebSocket / Server-Sent Events for sub-minute price updates
- [ ] Persistent server-side storage for watchlists (currently localStorage only)
- [ ] User accounts via NextAuth + per-account watchlists
- [ ] Backtest tab on the stock drawer using historical OHLCV
- [ ] More indicators: Bollinger Bands, ADX, OBV
- [ ] Voice input on the chatbot (Web Speech API)
- [ ] Self-hosted news scraper as a third tier behind GNews + NewsAPI
- [ ] Country mesh overlay on the globe (highlight on event)
- [ ] Internationalisation (i18n) — currently English-only

## 🙏 Acknowledgements

- Earth textures from [`three-globe`](https://github.com/vasturiano/three-globe)
  (NASA Blue Marble + Earth Night).
- Yahoo Finance for the unauthenticated quote / search / OHLCV endpoints.
- [GNews](https://gnews.io) and [NewsAPI](https://newsapi.org) for headlines.
- [Google Gemini](https://aistudio.google.com) for the structured-JSON LLM
  backend.
- [`lightweight-charts`](https://github.com/tradingview/lightweight-charts)
  by TradingView, [`@dnd-kit`](https://dndkit.com), [`gsap`](https://gsap.com),
  [`zustand`](https://github.com/pmndrs/zustand),
  [`react-hot-toast`](https://react-hot-toast.com).

## 📄 License

[MIT](LICENSE) © GeoStock AI contributors.

---

<div align="center">

If GeoStock AI is useful to you, **star the repo** ⭐ — it helps a lot.
Found a bug, have an idea, or just want to chat about geopolitics + markets?
**[Open an issue](../../issues/new)** or jump into the
[discussions](../../discussions). See you there.

</div>
