"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EXCHANGES,
  EXCHANGE_KEYS,
  getAllExchangeStatuses,
  type ExchangeKey,
  type ExchangeStatusResult,
} from "@/lib/exchanges";
import { useSettings } from "@/lib/settings";
import { useWatchlists } from "@/lib/watchlists";

interface Props {
  onPickExchange?: (key: ExchangeKey) => void;
}

function formatUTC(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

/**
 * Multi-exchange status strip + UTC clock + active exchange local time.
 * Footer updates the status pills every 30 s and the UTC clock every 1 s.
 */
export default function FooterBar({ onPickExchange }: Props) {
  // Seed statuses + UTC clock synchronously on first render — keeps the
  // pills + clock from "popping in" and avoids a setState-in-effect on
  // mount. Both are deterministic at render time (no hydration mismatch
  // since this component is only used inside a `"use client"` page that
  // never SSRs).
  const [statuses, setStatuses] = useState<
    Record<ExchangeKey, ExchangeStatusResult>
  >(() => getAllExchangeStatuses(new Date()));
  const [nowUtc, setNowUtc] = useState<Date>(() => new Date());

  const visibleExchanges = useSettings((s) => s.visibleExchanges);
  const activeFilter = useWatchlists((s) => s.exchangeFilter);
  const setFilter = useWatchlists((s) => s.setExchangeFilter);

  const pillsRef = useRef<HTMLDivElement | null>(null);

  // Tick the status pills (countdowns) every 30 s
  useEffect(() => {
    const id = setInterval(
      () => setStatuses(getAllExchangeStatuses(new Date())),
      30_000
    );
    return () => clearInterval(id);
  }, []);

  // Tick the UTC clock every second
  useEffect(() => {
    const id = setInterval(() => setNowUtc(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Convert vertical mouse-wheel into horizontal scroll on the pills row.
  // Touch devices already scroll horizontally natively, but desktop users
  // with a regular wheel can't reach the right-most pills otherwise (and
  // the scrollbar is hidden for a cleaner footer).
  useEffect(() => {
    const el = pillsRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Only intercept "pure vertical" wheels — leave trackpad 2-finger
      // horizontal gestures (deltaX) to the browser.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      // Nothing to scroll? bail so the page can still scroll if it ever needs to.
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /** Whichever exchange the user has filtered to — or NYSE when "ALL". */
  const activeStatus = useMemo<ExchangeStatusResult | null>(() => {
    if (activeFilter === "ALL") return statuses.NYSE ?? null;
    return statuses[activeFilter as ExchangeKey] ?? null;
  }, [statuses, activeFilter]);

  const pills: ExchangeKey[] = useMemo(() => {
    const set = new Set(visibleExchanges);
    return EXCHANGE_KEYS.filter((k) => set.has(k));
  }, [visibleExchanges]);

  const handlePill = (key: ExchangeKey) => {
    if (onPickExchange) onPickExchange(key);
    setFilter(activeFilter === key ? "ALL" : key);
  };

  return (
    <footer className="footer-bar" aria-label="Exchange status">
      <div className="exchange-pills-wrap">
        <div className="exchange-pills" role="list" ref={pillsRef}>
          {pills.length === 0 ? (
            <span className="footer-empty">
              No exchanges visible — enable some in Settings.
            </span>
          ) : (
            pills.map((key) => {
            const ex = EXCHANGES[key];
            const s = statuses[key];
            const active = activeFilter === key;
            const cls = `ex-pill ${s.status.toLowerCase()} ${active ? "active" : ""}`;
            return (
              <button
                type="button"
                role="listitem"
                key={key}
                className={cls}
                onClick={() => handlePill(key)}
                title={`${ex.name} — ${s.label} (${s.localTime})`}
              >
                <span
                  className="status-dot"
                  style={{ background: s.color }}
                />
                <span className="ex-flag" aria-hidden="true">
                  {ex.flag}
                </span>
                <span className="ex-name">{key}</span>
                <span className="ex-status">{s.label}</span>
                {s.status === "OPEN" ? (
                  <span
                    className="session-bar"
                    aria-label={`${s.sessionProgress}% through session`}
                  >
                    <span
                      className="session-fill"
                      style={{ width: `${s.sessionProgress}%` }}
                    />
                  </span>
                ) : null}
                <span className="ex-next">{s.nextEvent}</span>
              </button>
            );
          })
          )}
        </div>
      </div>

      <div className="footer-right">
        <span className="utc-time" id="footer-utc">
          {formatUTC(nowUtc)}
        </span>
        <span className="active-ex-time" id="footer-local">
          {activeStatus ? (
            <>
              {EXCHANGES[activeStatus.exchange].flag} {activeStatus.exchange}{" "}
              {activeStatus.localTime}
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
    </footer>
  );
}
