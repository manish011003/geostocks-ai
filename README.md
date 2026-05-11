# GeoStock AI

A geopolitical stock-intelligence dashboard built on Next.js (App Router). Live
stock watchlist, a rotatable Three.js 3D globe with AI-tagged event markers, and
a streaming geopolitical news feed analyzed by Claude.

## Stack

- **Next.js** + React + TypeScript (App Router, server routes)
- **Three.js** for the 3D globe (no `react-three-fiber`)
- **Tailwind v4** + custom CSS for the terminal-style theme
- **Google Gemini** (`gemini-2.5-flash`, structured JSON output) for severity / region / sector tagging and per-ticker prediction
- **Yahoo Finance v8** (no key needed) for prices + 30-day sparklines
- **GNews** (primary) / **NewsAPI** (fallback) for headlines
- Simple in-memory TTL cache for stocks (60s), news (10m), predictions (5m)

## Layout

- **Topbar (44px)**: logo + live dot, scrolling ticker, UTC clock, theme toggle
- **Main grid (3 columns)**:
  - Left (220px): Watchlist with sparklines + Regional Risk bars
  - Center (flex): Stats row, rotatable globe with pulsing markers, severity legend, live subsolar-point readout
  - Right (220px): Geopolitical event feed with severity badges
- **Floating "ASK AI" launcher** (bottom-right): opens a streaming chatbot dock backed by Gemini, with full live context (watchlist + events + 1-year price history of any mentioned ticker). Open with `Ctrl/Cmd + K`, close with `Esc`.

## Quick start

```bash
npm install
cp .env.example .env.local   # add your API keys
npm run dev                  # http://localhost:3000
```

The dashboard works **without API keys** — both news and Claude analysis fall
back to local heuristics + curated headlines so the UI is always populated. Add
keys for the live experience.

## Free API sign-ups

| Provider | Purpose                        | Limit                    | Sign-up                                |
| -------- | ------------------------------ | ------------------------ | -------------------------------------- |
| GNews    | Live headlines                 | 100 req/day              | https://gnews.io                       |
| NewsAPI  | Fallback headlines             | 100 req/day              | https://newsapi.org                    |
| Gemini   | Severity tagging + predictions | Free tier on AI Studio   | https://aistudio.google.com/app/apikey |

Yahoo Finance is consumed via the unauthenticated `query1.finance.yahoo.com/v8/finance/chart` endpoint.

## File map

```
app/
  layout.tsx          fonts (Syne + DM Mono), ThemeProvider
  page.tsx            dashboard shell, fetch loops, chat launcher
  globals.css         theme variables (dark + light), animations
  api/
    stocks/route.ts   GET  — Yahoo Finance for the watchlist
    news/route.ts     GET  — GNews → Gemini tagger
    analyze/route.ts  POST — { ticker } → Gemini prediction
    chat/route.ts     POST — streaming Gemini chat with live context
components/
  Globe.tsx           Three.js scene with day/night blend shader + real-time sun
  CenterPanel.tsx     stats row + Globe + legend
  TopBar.tsx          logo, ticker tape, UTC clock, theme toggle
  TickerTape.tsx      auto-scrolling marquee
  Watchlist.tsx       left-panel stock rows
  StockChart.tsx      lightweight SVG sparkline
  RiskBars.tsx        regional risk score bars
  EventFeed.tsx       right-panel event list
  Tooltip3D.tsx       reusable globe tooltip card
  Chatbot.tsx         streaming chatbot dock with markdown rendering
  AskAIButton.tsx     floating "ASK AI" launcher
  ThemeProvider.tsx   dark / light theme context
  ThemeToggle.tsx     topbar theme switch button
  SubsolarIndicator.tsx live subsolar lat/lon under the legend
lib/
  gemini.ts           Google Gemini SDK wrapper (tagHeadlines, analyzeTicker)
  chatContext.ts      builds the live LIVE CONTEXT block for the chatbot
  stocks.ts           Yahoo Finance fetcher + 1y/5y history + summary
  watchlist-syms.ts   client-safe ticker list
  news.ts             GNews + NewsAPI fetcher + fallback
  cache.ts            in-memory TTL cache
  geo.ts              lat/lon ↔ Three.js Vec3 helpers
  sun.ts              live subsolar (lat, lon) for shader lighting
types/
  index.ts            shared interfaces
```

## API routes

### `GET /api/stocks`

Returns the full watchlist (`AAPL, TSLA, XOM, LMT, NVDA, BA, CVX, GOLD`).

```jsonc
{
  "stocks": [
    {
      "sym": "AAPL",
      "name": "Apple Inc.",
      "sector": "tech",
      "price": 187.65,
      "change": 1.21,
      "changePercent": 0.65,
      "sparkline": [183.2, 184.1, /* ... */]
    }
    /* ... */
  ],
  "cached": false
}
```

Cached 60 seconds. Falls back to deterministic synthetic data if Yahoo is unreachable.

### `GET /api/news`

Pulls 10 latest geopolitical headlines from GNews (or NewsAPI), then sends them
to Gemini for batch tagging (structured JSON output):

```jsonc
{
  "events": [
    {
      "id": "evt-0-...",
      "title": "...",
      "summary": "...",
      "severity": "HIGH",
      "region": "Eastern Europe",
      "lat": 50.5,
      "lon": 30.5,
      "affected_sectors": ["energy", "defense"],
      "publishedAt": "2026-...",
      "source": "Reuters"
    }
  ],
  "cached": false
}
```

Cached 10 minutes. If Gemini is unavailable, a heuristic tagger labels by keyword.

### `POST /api/analyze`

```jsonc
// request
{ "ticker": "LMT" }

// response
{
  "ticker": "LMT",
  "sentiment_score": 0.42,
  "direction": "Up",
  "confidence": "Medium",
  "reasoning": ["...", "..."],
  "key_triggers": ["defense", "sanctions"]
}
```

Cached 5 minutes per ticker.

### `POST /api/chat`

Streaming chat endpoint backing the in-dashboard analyst. Each request is
served by Gemini with a freshly built `LIVE CONTEXT` block containing the
watchlist quotes, AI-tagged events, and a 1-year OHLC summary for any tickers
referenced in the user's message.

```jsonc
// request
{
  "messages": [
    { "role": "user", "content": "Predict LMT for the next 3 months." }
  ],
  "ticker": "LMT" // optional, otherwise auto-detected from the message
}

// response: text/plain stream of markdown chunks
```

The chat dock uses the standard `fetch` `ReadableStream` API to render tokens
progressively. With no `GEMINI_API_KEY` configured, the route returns a
fallback summary of the live context so the UI keeps working in dev.

## Curl-test the API

```bash
curl http://localhost:3000/api/stocks
curl http://localhost:3000/api/news
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"ticker":"LMT"}'
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Predict LMT for the next 3 months."}]}'
```

## Design notes

- The Earth uses two `three-globe` textures from unpkg (`earth-blue-marble.jpg`
  for daylight and `earth-night.jpg` for city lights). A custom GLSL shader
  blends them based on the live subsolar point (`lib/sun.ts`), so daylight
  matches whatever the wall clock says it should be.
- The dark hemisphere shows a tinted, darkened day texture so continents stay
  legible at night, with the night texture layered on top as emissive city
  lights.
- The atmosphere is a `BackSide` shader pass that's brighter on the lit limb;
  in light mode it switches to normal blending so the halo reads against a
  bright background.
- Auto-rotate pauses on user interaction and resumes ~6s after release.
- A `ResizeObserver` keeps the canvas square as the layout flexes.
- All fetches degrade gracefully so the dashboard never goes blank.
- The chat route streams Gemini output via Web `ReadableStream`; the client
  renders the markdown progressively with a small custom renderer (no
  unsanitised HTML).

## Production build

```bash
npm run build
npm start
```

## License

MIT
