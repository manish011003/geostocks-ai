"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/ThemeProvider";
import { useWatchlists } from "@/lib/watchlists";
import type { GeoEvent, StockData } from "@/types";

const CandlestickChart = dynamic(
  () => import("@/components/CandlestickChart"),
  { ssr: false }
);

interface OHLC {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface HistoryResp {
  bars: OHLC[];
  rsi: number[];
  meta?: { currency?: string; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number };
}

interface SignalReadout {
  score: number;
  weight: number;
  detail: Record<string, unknown>;
}

interface PredictionResp {
  ticker: string;
  composite_score: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  signals: {
    news: SignalReadout;
    technical: SignalReadout;
    regional_risk: SignalReadout;
    sector: SignalReadout;
    volatility: SignalReadout;
  };
  reasoning: string[];
  key_triggers: string[];
  price_target_range: { low: number; high: number; timeframe: string };
  current_price?: number;
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  return n.toFixed(2);
}

interface TargetHeroProps {
  prediction: PredictionResp;
}

/** Big "price target" hero card. Hover the (?) for the calculation. */
function PriceTargetHero({ prediction }: TargetHeroProps) {
  const { price_target_range: range, current_price, signals, composite_score } =
    prediction;
  const hasTarget = range.low > 0 && range.high > 0;
  const mid = hasTarget ? (range.low + range.high) / 2 : null;
  const upsidePct =
    mid !== null && current_price && current_price > 0
      ? ((mid - current_price) / current_price) * 100
      : null;
  const tone =
    upsidePct === null
      ? "neutral"
      : upsidePct > 1
        ? "bullish"
        : upsidePct < -1
          ? "bearish"
          : "neutral";

  const vol =
    typeof signals.volatility.detail.realized_vol_pct === "number"
      ? signals.volatility.detail.realized_vol_pct
      : null;

  return (
    <div className={`target-hero tone-${tone}`}>
      <div className="target-hero-head">
        <span className="lbl">7-day price target</span>
        <span
          className="info-tip"
          tabIndex={0}
          aria-label="How is the target calculated?"
        >
          ?
          <span className="tip-popover" role="tooltip">
            <strong>How this is calculated</strong>
            <ol>
              <li>
                <code>μ</code> = current price ×{" "}
                <code>(1 + composite/100 × 0.04)</code>
                <br />
                <small>
                  → composite{" "}
                  <code>{composite_score.toFixed(1)}</code> nudges the centre
                  of the range up or down ~4% at full conviction.
                </small>
              </li>
              <li>
                <code>σ_7d</code> = current price ×{" "}
                <code>(realised vol / √252) × √7</code>
                <br />
                <small>
                  → realised 30-day vol{" "}
                  <code>
                    {vol !== null ? `${vol.toFixed(1)}%` : "fallback 1.5%/d"}
                  </code>{" "}
                  scaled to a 1-week horizon.
                </small>
              </li>
              <li>
                Range = <code>μ ± σ_7d</code> — i.e. a 1-standard-deviation
                band around the model's centre, not a guaranteed corridor.
              </li>
            </ol>
            <em>
              The composite blends 5 signals: news 30%, technical 25%, regional
              risk 20%, sector 15%, volatility 10%.
            </em>
          </span>
        </span>
      </div>
      {hasTarget ? (
        <>
          <div className="target-hero-range">
            <span className="amt low">${fmtMoney(range.low)}</span>
            <span className="dash">–</span>
            <span className="amt high">${fmtMoney(range.high)}</span>
          </div>
          <div className="target-hero-meta">
            {current_price ? (
              <span className="now">Now ${fmtMoney(current_price)}</span>
            ) : null}
            {upsidePct !== null ? (
              <span className={`delta tone-${tone}`}>
                {upsidePct > 0 ? "▲" : upsidePct < 0 ? "▼" : "·"}{" "}
                {Math.abs(upsidePct).toFixed(2)}% mid
              </span>
            ) : null}
            {mid !== null ? (
              <span className="mid">μ ${fmtMoney(mid)}</span>
            ) : null}
          </div>
        </>
      ) : (
        <div className="target-hero-empty">
          Insufficient price history to project a target.
        </div>
      )}
    </div>
  );
}

type Tab = "chart" | "ai" | "events";

interface Props {
  ticker: string | null;
  stock?: StockData | null;
  events: GeoEvent[];
  open: boolean;
  onClose: () => void;
  onSelectTicker: (sym: string) => void;
}

const RANGES = ["1W", "1M", "3M", "6M", "1Y"] as const;
type Range = (typeof RANGES)[number];

const RANGE_TO_API: Record<Range, string> = {
  "1W": "5d",
  "1M": "1mo",
  "3M": "3mo",
  "6M": "6mo",
  "1Y": "1y",
};

function fmt(p: number | undefined) {
  if (p === undefined || !Number.isFinite(p)) return "—";
  if (p > 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return p.toFixed(2);
}

function ScoreGauge({ score }: { score: number }) {
  // Semicircle from -100 (left) to +100 (right). Score is in -100..100.
  const clamped = Math.max(-100, Math.min(100, score));
  const angle = ((clamped + 100) / 200) * 180; // 0..180 deg
  const cx = 70;
  const cy = 70;
  const r = 56;
  const start = { x: cx - r, y: cy };
  const end = {
    x: cx - r * Math.cos((angle * Math.PI) / 180),
    y: cy - r * Math.sin((angle * Math.PI) / 180),
  };
  const large = angle > 180 ? 1 : 0;

  const color =
    clamped > 15 ? "var(--green)" : clamped < -15 ? "var(--red)" : "var(--amber)";

  return (
    <svg viewBox="0 0 140 80" className="score-gauge" aria-hidden="true">
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="var(--border)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <text
        x={cx}
        y={cy - 10}
        textAnchor="middle"
        fontSize="22"
        fontFamily="var(--font-syne, sans-serif)"
        fontWeight="700"
        fill="var(--text)"
      >
        {Math.round(clamped)}
      </text>
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        fontSize="9"
        letterSpacing="2"
        fill="var(--muted)"
      >
        COMPOSITE
      </text>
    </svg>
  );
}

function SignalRow({
  label,
  s,
}: {
  label: string;
  s: SignalReadout;
}) {
  const tone =
    s.score > 15 ? "pos" : s.score < -15 ? "neg" : "neu";
  return (
    <div className="signal-row">
      <span className="lbl">{label}</span>
      <span className={`val ${tone}`}>
        {s.score > 0 ? "+" : ""}
        {s.score}
      </span>
      <span className="wgt">{Math.round(s.weight * 100)}%</span>
    </div>
  );
}

export default function StockDrawer({
  ticker,
  stock,
  events,
  open,
  onClose,
  onSelectTicker,
}: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>("chart");
  const [range, setRange] = useState<Range>("1M");
  const [history, setHistory] = useState<HistoryResp | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResp | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);

  const watchlists = useWatchlists();

  const inAnyList = useMemo(() => {
    if (!ticker) return false;
    return watchlists.lists.some((l) =>
      l.entries.some((e) => e.sym.toUpperCase() === ticker.toUpperCase())
    );
  }, [ticker, watchlists]);

  // Fetch chart data
  useEffect(() => {
    if (!open || !ticker || tab !== "chart") return;
    setHistoryLoading(true);
    const ctrl = new AbortController();
    fetch(`/api/history?symbol=${ticker}&range=${RANGE_TO_API[range]}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data: HistoryResp) => setHistory(data))
      .catch((err) => {
        if ((err as { name?: string }).name !== "AbortError")
          console.warn("[stock-drawer] history fetch failed", err);
      })
      .finally(() => setHistoryLoading(false));
    return () => ctrl.abort();
  }, [ticker, open, tab, range]);

  // Fetch prediction
  useEffect(() => {
    if (!open || !ticker || tab !== "ai") return;
    setPredictionLoading(true);
    const ctrl = new AbortController();
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker }),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data: PredictionResp) => setPrediction(data))
      .catch((err) => {
        if ((err as { name?: string }).name !== "AbortError")
          console.warn("[stock-drawer] prediction fetch failed", err);
      })
      .finally(() => setPredictionLoading(false));
    return () => ctrl.abort();
  }, [ticker, open, tab]);

  // Reset state when ticker changes
  useEffect(() => {
    setTab("chart");
    setHistory(null);
    setPrediction(null);
  }, [ticker]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggleStar = useCallback(() => {
    if (!ticker) return;
    const sym = ticker.toUpperCase();
    if (inAnyList) {
      // Remove from every list
      for (const l of watchlists.lists) {
        if (l.entries.some((e) => e.sym === sym))
          watchlists.removeStock(l.name, sym);
      }
    } else {
      watchlists.addStock(watchlists.active, {
        sym,
        name: stock?.name ?? sym,
        sector: stock?.sector,
      });
    }
  }, [ticker, stock, inAnyList, watchlists]);

  const relatedEvents = useMemo(() => {
    if (!stock) return events.slice(0, 6);
    return events.filter((e) =>
      (e.affected_sectors as string[]).includes(stock.sector)
    );
  }, [events, stock]);

  const positive = stock ? stock.changePercent >= 0 : false;

  return (
    <>
      <div
        className={`drawer-backdrop ${open ? "open" : ""}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`drawer ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${ticker ?? "Stock"} detail`}
      >
        <div className="drawer-header">
          <div className="drawer-id">
            <button
              type="button"
              className={`star-btn ${inAnyList ? "on" : ""}`}
              aria-label={inAnyList ? "Remove from watchlist" : "Add to watchlist"}
              onClick={toggleStar}
              title={inAnyList ? "Starred" : "Add to watchlist"}
            >
              {inAnyList ? "★" : "☆"}
            </button>
            <div className="drawer-titles">
              <div className="ticker">{ticker ?? "—"}</div>
              <div className="name">{stock?.name ?? "—"}</div>
            </div>
          </div>
          <div className="drawer-price">
            <div className={`price ${positive ? "pos" : "neg"}`}>
              ${fmt(stock?.price)}
            </div>
            <div className={`pct ${positive ? "pos" : "neg"}`}>
              {stock
                ? `${positive ? "+" : ""}${stock.changePercent.toFixed(2)}%  ·  ${
                    positive ? "+" : ""
                  }${stock.change.toFixed(2)}`
                : "—"}
            </div>
          </div>
          <div className="drawer-meta">
            <span className="badge-ghost">
              {stock?.sector?.toUpperCase() ?? "—"}
            </span>
            <span className="badge-ghost">{stock?.currency ?? "USD"}</span>
            <button
              type="button"
              className="drawer-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="drawer-tabs">
          {(["chart", "ai", "events"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`drawer-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "chart" ? "Chart" : t === "ai" ? "AI Prediction" : "Related Events"}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === "chart" ? (
            <div className="tab-chart">
              <div className="range-row">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`range ${range === r ? "active" : ""}`}
                    onClick={() => setRange(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {historyLoading && !history ? (
                <div className="skel" style={{ height: 320, width: "100%" }} />
              ) : history && history.bars.length > 0 ? (
                <CandlestickChart
                  bars={history.bars}
                  rsi={history.rsi}
                  theme={theme}
                />
              ) : (
                <div className="empty-state">No chart data</div>
              )}
            </div>
          ) : tab === "ai" ? (
            <div className="tab-ai">
              {predictionLoading && !prediction ? (
                <>
                  <div className="skel" style={{ height: 90, width: "100%", marginBottom: 12 }} />
                  <div className="skel" style={{ height: 60, width: "100%", marginBottom: 12 }} />
                  <div className="skel" style={{ height: 200, width: "100%" }} />
                </>
              ) : prediction ? (
                <>
                  <PriceTargetHero prediction={prediction} />

                  <div className="ai-summary">
                    <ScoreGauge score={prediction.composite_score} />
                    <div className="ai-summary-meta">
                      <span
                        className={`direction-badge dir-${prediction.direction.toLowerCase()}`}
                      >
                        {prediction.direction}
                      </span>
                      <div className="confidence">
                        <span className="lbl">CONFIDENCE</span>
                        <div className="confidence-bar">
                          <span style={{ width: `${prediction.confidence}%` }} />
                        </div>
                        <span className="val">{prediction.confidence}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="signal-section">
                    <div className="section-title">Signal Breakdown</div>
                    <div className="signal-table">
                      <div className="signal-row head">
                        <span>Signal</span>
                        <span>Score</span>
                        <span>Weight</span>
                      </div>
                      <SignalRow label="News sentiment" s={prediction.signals.news} />
                      <SignalRow label="Technical (RSI/MACD/SMA)" s={prediction.signals.technical} />
                      <SignalRow label="Regional risk delta" s={prediction.signals.regional_risk} />
                      <SignalRow label="Sector correlation" s={prediction.signals.sector} />
                      <SignalRow label="Historical volatility" s={prediction.signals.volatility} />
                    </div>
                  </div>

                  {prediction.reasoning.length > 0 ? (
                    <div className="signal-section">
                      <div className="section-title">Reasoning</div>
                      <ul className="reasoning-list">
                        {prediction.reasoning.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {prediction.key_triggers.length > 0 ? (
                    <div className="signal-section">
                      <div className="section-title">Key Triggers</div>
                      <div className="triggers">
                        {prediction.key_triggers.map((t) => (
                          <span key={t} className="trigger-chip">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="empty-state">No prediction yet</div>
              )}
            </div>
          ) : (
            <div className="tab-events">
              {relatedEvents.length === 0 ? (
                <div className="empty-state">No related events</div>
              ) : (
                relatedEvents.map((e) => (
                  <div key={e.id} className="event-item">
                    <div className="top-row">
                      <span className="region">{e.region}</span>
                      <span className={`severity ${e.severity}`}>{e.severity}</span>
                    </div>
                    <div className="title">{e.title}</div>
                    <div className="meta">
                      <span>{e.source}</span>
                      <span>{new Date(e.publishedAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
