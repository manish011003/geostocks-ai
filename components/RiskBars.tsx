"use client";

import { useMemo } from "react";
import type { GeoEvent } from "@/types";

interface Props {
  events: GeoEvent[];
}

/** Top-level risk buckets shown in the UI. Sub-regions emitted by the Gemini
 *  tagger are mapped into one of these via REGION_ALIASES. */
const REGIONS_OF_INTEREST = [
  "Middle East",
  "Europe",
  "East Asia",
  "South Asia",
  "Africa",
  "Americas",
] as const;

const REGION_ALIASES: Record<string, (typeof REGIONS_OF_INTEREST)[number]> = {
  "Middle East": "Middle East",
  "Eastern Europe": "Europe",
  "Western Europe": "Europe",
  "Northern Europe": "Europe",
  "Southern Europe": "Europe",
  Europe: "Europe",
  "East Asia": "East Asia",
  "Southeast Asia": "East Asia",
  "Central Asia": "East Asia",
  "South Asia": "South Asia",
  Africa: "Africa",
  Americas: "Americas",
  "North America": "Americas",
  "South America": "Americas",
  "Central America": "Americas",
};

const SEVERITY_WEIGHT: Record<string, number> = {
  HIGH: 1.0,
  MEDIUM: 0.55,
  LOW: 0.2,
};

function colorForScore(score: number): string {
  if (score >= 0.66) return "var(--red)";
  if (score >= 0.33) return "var(--amber)";
  return "var(--green)";
}

export default function RiskBars({ events }: Props) {
  const bars = useMemo(() => {
    const buckets: Record<string, GeoEvent[]> = Object.fromEntries(
      REGIONS_OF_INTEREST.map((r) => [r, []])
    );
    for (const e of events) {
      const bucket = REGION_ALIASES[e.region] ?? null;
      if (bucket) buckets[bucket].push(e);
    }

    return REGIONS_OF_INTEREST.map((region) => {
      const matches = buckets[region];
      if (matches.length === 0) return { region, score: 0.05, count: 0 };

      const sum = matches.reduce(
        (s, e) => s + (SEVERITY_WEIGHT[e.severity] ?? 0.2),
        0
      );
      const avg = sum / matches.length;
      const volumeBonus = Math.min(0.25, matches.length * 0.05);
      const score = Math.min(1, avg + volumeBonus);
      return { region, score, count: matches.length };
    });
  }, [events]);

  return (
    <div>
      {bars.map((b) => (
        <div className="risk-row" key={b.region}>
          <div className="label">
            <span>{b.region}</span>
            <span className="v">
              {(b.score * 100).toFixed(0)}
              <span style={{ color: "var(--muted)" }}>
                {b.count > 0 ? `  ·  ${b.count}` : ""}
              </span>
            </span>
          </div>
          <div className="risk-bar">
            <span
              style={{
                width: `${Math.max(2, b.score * 100)}%`,
                background: colorForScore(b.score),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
