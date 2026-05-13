"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import SubsolarIndicator from "@/components/SubsolarIndicator";
import EventDetailPanel from "@/components/EventDetailPanel";
import { useSettings } from "@/lib/settings";
import { nyseState } from "@/lib/marketHours";
import type { ExchangeKey } from "@/lib/exchanges";
import type { GeoEvent, StockData } from "@/types";

const Globe = dynamic(() => import("@/components/Globe"), {
  ssr: false,
  loading: () => (
    <div
      className="globe-mount"
      style={{ display: "grid", placeItems: "center" }}
    >
      <div
        className="skel"
        style={{
          width: "70%",
          aspectRatio: "1 / 1",
          borderRadius: "50%",
          maxWidth: 520,
        }}
      />
    </div>
  ),
});

interface Props {
  events: GeoEvent[];
  stocks: StockData[];
  focusEvent: GeoEvent | null;
  /** v2: when the user picks an exchange (via selector or footer pill) we
   *  swing the globe to its home country. */
  focusExchange?: ExchangeKey | null;
  onMarkerClick: (event: GeoEvent) => void;
  onCloseEventPanel: () => void;
  onPickTicker: (sym: string) => void;
}

export default function CenterPanel({
  events,
  stocks,
  focusEvent,
  focusExchange,
  onMarkerClick,
  onCloseEventPanel,
  onPickTicker,
}: Props) {
  const { theme } = useTheme();
  const { autoRotate, rotationSpeed, showMarkers, markerPulse } = useSettings();
  const [marketLabel, setMarketLabel] = useState<string>("NYSE …");

  useEffect(() => {
    const update = () => setMarketLabel(nyseState().label);
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    const high = events.filter((e) => e.severity === "HIGH").length;
    const med = events.filter((e) => e.severity === "MEDIUM").length;
    const low = events.filter((e) => e.severity === "LOW").length;

    const movers = stocks.length;
    const advancers = stocks.filter((s) => s.changePercent >= 0).length;
    const advancePct =
      movers > 0 ? Math.round((advancers / movers) * 100) : 0;

    const w =
      events.reduce(
        (s, e) =>
          s + (e.severity === "HIGH" ? 1 : e.severity === "MEDIUM" ? 0.55 : 0.2),
        0
      ) / Math.max(1, events.length);
    const worldRisk = Math.round(w * 100);

    return { high, med, low, advancePct, worldRisk };
  }, [events, stocks]);

  return (
    <section className="panel center">
      <div className="stats-row">
        <div className="stat">
          <span className="k">World Risk Index</span>
          <span
            className={`v ${
              stats.worldRisk >= 66
                ? "red"
                : stats.worldRisk >= 33
                  ? "amber"
                  : "green"
            }`}
          >
            {stats.worldRisk}
          </span>
        </div>
        <div className="stat">
          <span className="k">High Severity</span>
          <span className="v red">{stats.high}</span>
        </div>
        <div className="stat">
          <span className="k">Medium</span>
          <span className="v amber">{stats.med}</span>
        </div>
        <div className="stat">
          <span className="k">Advancers</span>
          <span className="v blue">{stats.advancePct}%</span>
        </div>
      </div>

      <div className="globe-wrap">
        <div className="crosshair" />
        <Globe
          events={events}
          theme={theme}
          focusEvent={focusEvent}
          focusExchange={focusExchange}
          onMarkerClick={onMarkerClick}
          autoRotate={autoRotate && !focusEvent && !focusExchange}
          autoRotateSpeed={rotationSpeed}
          showMarkers={showMarkers}
          markerPulse={markerPulse}
        />
        <EventDetailPanel
          event={focusEvent}
          open={!!focusEvent}
          onClose={onCloseEventPanel}
          onPickTicker={onPickTicker}
        />
      </div>

      <div className="legend">
        <span className="key">
          <span
            className="swatch"
            style={{ color: "var(--red)", background: "var(--red)" }}
          />
          High
        </span>
        <span className="key">
          <span
            className="swatch"
            style={{ color: "var(--amber)", background: "var(--amber)" }}
          />
          Medium
        </span>
        <span className="key">
          <span
            className="swatch"
            style={{ color: "var(--green)", background: "var(--green)" }}
          />
          Low
        </span>
        <SubsolarIndicator />
        <span
          className={`market-pill ${marketLabel.includes("OPEN") ? "open" : marketLabel.includes("CLOSED") ? "closed" : "off"}`}
        >
          {marketLabel}
        </span>
      </div>
    </section>
  );
}
