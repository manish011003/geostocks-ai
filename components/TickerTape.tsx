"use client";

import { useMemo } from "react";
import type { StockData } from "@/types";
import { useSettings, tickerDurationSec } from "@/lib/settings";
import { useWatchlists } from "@/lib/watchlists";
import {
  EXCHANGES,
  formatPriceCompact,
  resolveExchange,
  type ExchangeKey,
} from "@/lib/exchanges";

interface Props {
  stocks: StockData[];
  onSelect?: (sym: string) => void;
}

/**
 * Auto-scrolling marquee. Rendered twice end-to-end so the CSS
 * `translateX(-50%)` keyframe seamlessly loops.
 *
 * v2 changes: applies the active exchange filter, colours each chip by
 * exchange accent, formats prices in the row's native currency, and inserts
 * a flag divider when the exchange changes from one chip to the next.
 */
export default function TickerTape({ stocks, onSelect }: Props) {
  const speed = useSettings((s) => s.tickerSpeed);
  const exchangeFilter = useWatchlists((s) => s.exchangeFilter);

  const filtered = useMemo(() => {
    if (exchangeFilter === "ALL") return stocks;
    return stocks.filter((s) => {
      const ex = (s.exchange as ExchangeKey | undefined) ?? resolveExchange(s.sym);
      return ex === exchangeFilter;
    });
  }, [stocks, exchangeFilter]);

  // Stable sort so the divider math is predictable: group by exchange.
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const ea =
        (a.exchange as ExchangeKey | undefined) ?? resolveExchange(a.sym);
      const eb =
        (b.exchange as ExchangeKey | undefined) ?? resolveExchange(b.sym);
      return ea.localeCompare(eb);
    });
    return arr;
  }, [filtered]);

  const items = useMemo(() => {
    if (sorted.length === 0) return [];
    return [...sorted, ...sorted];
  }, [sorted]);

  if (items.length === 0) {
    return (
      <div className="ticker">
        <div className="ticker-inner" style={{ animationDuration: "0s" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <span className="ticker-item" key={i}>
              <span className="skel" style={{ width: 90, height: 12 }} />
            </span>
          ))}
        </div>
      </div>
    );
  }

  let lastEx: ExchangeKey | null = null;

  return (
    <div className="ticker">
      <div
        className="ticker-inner"
        style={{ animationDuration: `${tickerDurationSec(speed)}s` }}
      >
        {items.map((s, i) => {
          const positive = s.changePercent >= 0;
          const interactive = !!onSelect;
          const exchange = ((s.exchange as ExchangeKey | undefined) ??
            resolveExchange(s.sym)) as ExchangeKey;
          const ex = EXCHANGES[exchange];
          const showDivider = lastEx !== null && lastEx !== exchange;
          lastEx = exchange;
          const priceStr = formatPriceCompact(s.price, s.currency ?? ex.currency);
          return (
            <span key={`${s.sym}-${exchange}-${i}`} className="ticker-pair">
              {showDivider ? (
                <span
                  className="ticker-divider"
                  aria-hidden="true"
                  title={ex.name}
                  style={{ color: ex.color }}
                >
                  <span className="ticker-divider-bar" />
                  <span className="ticker-divider-flag">{ex.flag}</span>
                </span>
              ) : null}
              <span
                className={`ticker-item ${interactive ? "interactive" : ""}`}
                onClick={interactive ? () => onSelect!(s.sym) : undefined}
                style={
                  { "--ex-color": ex.color } as React.CSSProperties
                }
              >
                <span className="sym" style={{ color: ex.color }}>
                  {s.sym}
                </span>
                <span style={{ color: "var(--muted)" }}>·</span>
                <span>{priceStr}</span>
                <span className={positive ? "pos" : "neg"}>
                  {positive ? "▲" : "▼"}{" "}
                  {Math.abs(s.changePercent).toFixed(2)}%
                </span>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
