"use client";

import { useMemo } from "react";
import type { StockData } from "@/types";
import { useSettings, tickerDurationSec } from "@/lib/settings";

interface Props {
  stocks: StockData[];
  onSelect?: (sym: string) => void;
}

function fmtPrice(p: number) {
  if (p > 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return p.toFixed(2);
}

/**
 * Auto-scrolling marquee. We render the list twice end-to-end so the CSS
 * `translateX(-50%)` keyframe seamlessly loops.
 */
export default function TickerTape({ stocks, onSelect }: Props) {
  const speed = useSettings((s) => s.tickerSpeed);
  const items = useMemo(() => {
    if (stocks.length === 0) return [];
    return [...stocks, ...stocks];
  }, [stocks]);

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

  return (
    <div className="ticker">
      <div
        className="ticker-inner"
        style={{ animationDuration: `${tickerDurationSec(speed)}s` }}
      >
        {items.map((s, i) => {
          const positive = s.changePercent >= 0;
          const interactive = !!onSelect;
          return (
            <span
              className={`ticker-item ${interactive ? "interactive" : ""}`}
              key={`${s.sym}-${i}`}
              onClick={interactive ? () => onSelect!(s.sym) : undefined}
            >
              <span className="sym">{s.sym}</span>
              <span style={{ color: "var(--muted)" }}>·</span>
              <span>{fmtPrice(s.price)}</span>
              <span className={positive ? "pos" : "neg"}>
                {positive ? "▲" : "▼"} {Math.abs(s.changePercent).toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
