"use client";

import {
  EXCHANGES,
  EXCHANGE_OPTIONS,
  type ExchangeKey,
} from "@/lib/exchanges";
import { useWatchlists, type ExchangeFilter } from "@/lib/watchlists";
import { useSettings } from "@/lib/settings";

interface Props {
  /** Optional callback for when the user clicks a non-ALL pill (used by the
   *  parent to focus the globe on that exchange's country). */
  onPickExchange?: (key: ExchangeKey) => void;
}

/**
 * Pill row that filters the watchlist + ticker tape + globe to a single
 * exchange (or "ALL"). State lives in the watchlists store so the filter
 * survives navigation + persists per-user.
 */
export default function ExchangeSelector({ onPickExchange }: Props) {
  const active = useWatchlists((s) => s.exchangeFilter);
  const setActive = useWatchlists((s) => s.setExchangeFilter);
  const visible = useSettings((s) => s.visibleExchanges);

  // Always show "ALL"; hide individual exchanges the user disabled.
  const visibleSet = new Set<string>(visible);
  const options = EXCHANGE_OPTIONS.filter(
    (o) => o.key === "ALL" || visibleSet.has(o.key as ExchangeKey)
  );

  const handleClick = (key: ExchangeFilter) => {
    setActive(key);
    if (key !== "ALL") onPickExchange?.(key as ExchangeKey);
  };

  return (
    <div
      className="exchange-selector"
      role="tablist"
      aria-label="Filter watchlist by exchange"
    >
      {options.map((opt) => {
        const def = opt.key === "ALL" ? null : EXCHANGES[opt.key as ExchangeKey];
        const isActive = active === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`ex-btn ${isActive ? "active" : ""}`}
            style={
              isActive && def
                ? {
                    background: def.color,
                    borderColor: def.color,
                    color: "#060a10",
                  }
                : undefined
            }
            onClick={() => handleClick(opt.key as ExchangeFilter)}
            title={def ? def.name : "All exchanges"}
          >
            <span aria-hidden="true">{opt.flag}</span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
