"use client";

import { useMemo, useState } from "react";
import NewsFilters, {
  defaultFilterState,
  type NewsFilterState,
  type RegionKey,
} from "@/components/NewsFilters";
import type { GeoEvent } from "@/types";

interface Props {
  events: GeoEvent[];
  loading?: boolean;
  error?: string | null;
  onSelect?: (event: GeoEvent) => void;
  selectedId?: string | null;
}

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const REGION_BUCKET: Record<string, RegionKey> = {
  "Middle East": "Middle East",
  "Eastern Europe": "Europe",
  "Western Europe": "Europe",
  "Northern Europe": "Europe",
  "Southern Europe": "Europe",
  "East Asia": "Asia",
  "Southeast Asia": "Asia",
  "South Asia": "Asia",
  "Central Asia": "Asia",
  "North America": "Americas",
  "South America": "Americas",
  "Central America": "Americas",
  Americas: "Americas",
  Africa: "Africa",
  Oceania: "Asia",
  Global: "Global",
};

function bucketFor(region: string): RegionKey {
  return REGION_BUCKET[region] ?? "Global";
}

export default function EventFeed({
  events,
  loading,
  error,
  onSelect,
  selectedId,
}: Props) {
  const [filter, setFilter] = useState<NewsFilterState>(defaultFilterState());

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filter.severities.length > 0 && !filter.severities.includes(e.severity))
        return false;
      if (filter.sectors.length > 0) {
        const sectors = e.affected_sectors as string[];
        if (!sectors.some((s) => filter.sectors.includes(s as never))) return false;
      }
      if (filter.region !== "Global") {
        const b = bucketFor(e.region);
        if (b !== filter.region) return false;
      }
      return true;
    });
  }, [events, filter]);

  return (
    <aside className="panel right">
      <div className="panel-header">
        <span>Geopolitical Feed</span>
        <span className="count">
          {filtered.length}/{events.length || "--"}
        </span>
      </div>

      <NewsFilters value={filter} onChange={setFilter} />

      <div className="panel-body">
        {error ? <div className="error-banner">{error}</div> : null}

        {loading && events.length === 0 ? (
          <div style={{ padding: 8 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="skel"
                style={{ height: 56, marginBottom: 6 }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {events.length === 0 ? "No events" : "No matches for filters"}
          </div>
        ) : (
          filtered.map((e) => (
            <div
              key={e.id}
              className={`event-item ${selectedId === e.id ? "selected" : ""}`}
              onClick={() => onSelect?.(e)}
            >
              <div className="top-row">
                <span className="region">{e.region}</span>
                <span className={`severity ${e.severity}`}>{e.severity}</span>
              </div>
              <div className="title">{e.title}</div>
              {e.affected_sectors?.length ? (
                <div className="sectors">
                  {(e.affected_sectors as string[]).slice(0, 4).map((s) => (
                    <span className="sector-tag" key={s}>
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="meta">
                <span>{e.source}</span>
                <span>{timeAgo(e.publishedAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
