"use client";

import { useEffect, useState } from "react";
import TickerTape from "@/components/TickerTape";
import ThemeToggle from "@/components/ThemeToggle";
import type { StockData } from "@/types";
import { useSettings } from "@/lib/settings";

interface Props {
  stocks: StockData[];
  onOpenSettings: () => void;
  onTickerClick?: (sym: string) => void;
}

function formatUTC(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds()
  )} UTC`;
  return { date, time };
}

export default function TopBar({
  stocks,
  onOpenSettings,
  onTickerClick,
}: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const displayName = useSettings((s) => s.displayName);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const stamp = now ? formatUTC(now) : { date: "----------", time: "--:--:-- UTC" };

  const initial = (displayName?.trim() || "U").charAt(0).toUpperCase();

  return (
    <header className="topbar">
      <div className="logo">
        <span className="live-dot" />
        <span>
          GEOSTOCK<span className="dot">·</span>AI
        </span>
        <span className="live-text" style={{ marginLeft: 6 }}>
          LIVE
        </span>
      </div>

      <TickerTape stocks={stocks} onSelect={onTickerClick} />

      <div className="utc-clock">
        <span>{stamp.date}</span>
        <span className="val">{stamp.time}</span>
      </div>

      <div className="topbar-actions">
        <ThemeToggle />
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 0 1 7.04 4.29l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          type="button"
          className="avatar-btn"
          onClick={onOpenSettings}
          aria-label="Profile"
          title={displayName?.trim() || "Profile"}
        >
          {initial}
        </button>
      </div>
    </header>
  );
}
