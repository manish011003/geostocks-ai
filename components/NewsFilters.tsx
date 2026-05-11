"use client";

import { useMemo } from "react";

export type SectorKey =
  | "energy"
  | "defense"
  | "tech"
  | "finance"
  | "commodities"
  | "industrials"
  | "consumer";

export type SeverityKey = "HIGH" | "MEDIUM" | "LOW";

export type RegionKey =
  | "Global"
  | "Americas"
  | "Europe"
  | "Middle East"
  | "Asia"
  | "Africa";

export interface NewsFilterState {
  sectors: SectorKey[]; // empty = "All"
  severities: SeverityKey[]; // empty = "All"
  region: RegionKey; // single-select
}

const SECTORS: { key: SectorKey; label: string }[] = [
  { key: "energy", label: "Energy" },
  { key: "defense", label: "Defense" },
  { key: "tech", label: "Tech" },
  { key: "finance", label: "Finance" },
  { key: "commodities", label: "Commodities" },
  { key: "industrials", label: "Industrials" },
];

const SEVERITIES: { key: SeverityKey; label: string; color: string }[] = [
  { key: "HIGH", label: "High", color: "var(--red)" },
  { key: "MEDIUM", label: "Med", color: "var(--amber)" },
  { key: "LOW", label: "Low", color: "var(--green)" },
];

const REGIONS: RegionKey[] = [
  "Global",
  "Americas",
  "Europe",
  "Middle East",
  "Asia",
  "Africa",
];

interface Props {
  value: NewsFilterState;
  onChange: (v: NewsFilterState) => void;
}

export function defaultFilterState(): NewsFilterState {
  return { sectors: [], severities: [], region: "Global" };
}

export default function NewsFilters({ value, onChange }: Props) {
  const sectorSet = useMemo(() => new Set(value.sectors), [value.sectors]);
  const severitySet = useMemo(
    () => new Set(value.severities),
    [value.severities]
  );

  const toggleSector = (key: SectorKey) => {
    if (sectorSet.has(key)) {
      onChange({ ...value, sectors: value.sectors.filter((s) => s !== key) });
    } else {
      onChange({ ...value, sectors: [...value.sectors, key] });
    }
  };
  const toggleSeverity = (key: SeverityKey) => {
    if (severitySet.has(key)) {
      onChange({
        ...value,
        severities: value.severities.filter((s) => s !== key),
      });
    } else {
      onChange({ ...value, severities: [...value.severities, key] });
    }
  };
  const setRegion = (r: RegionKey) => onChange({ ...value, region: r });

  return (
    <div className="news-filters">
      <div className="pill-row">
        <button
          type="button"
          className={`pill ${value.sectors.length === 0 ? "active all" : ""}`}
          onClick={() => onChange({ ...value, sectors: [] })}
        >
          All
        </button>
        {SECTORS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`pill ${sectorSet.has(s.key) ? "active" : ""}`}
            onClick={() => toggleSector(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="pill-row">
        <button
          type="button"
          className={`pill sev ${value.severities.length === 0 ? "active all" : ""}`}
          onClick={() => onChange({ ...value, severities: [] })}
        >
          All
        </button>
        {SEVERITIES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`pill sev sev-${s.key} ${
              severitySet.has(s.key) ? "active" : ""
            }`}
            onClick={() => toggleSeverity(s.key)}
            style={{ ["--sev-color" as string]: s.color }}
          >
            <span className="sev-dot" /> {s.label}
          </button>
        ))}
      </div>

      <div className="pill-row">
        {REGIONS.map((r) => (
          <button
            key={r}
            type="button"
            className={`pill region ${value.region === r ? "active" : ""}`}
            onClick={() => setRegion(r)}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
