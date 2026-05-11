"use client";

import { useEffect, useState } from "react";
import type { GeoEvent } from "@/types";

interface DetailResp {
  summary: string;
  background: string;
  market_impact: string;
  affected_stocks: string[];
  affected_sectors: string[];
  severity_reason: string;
  timeline: string;
  sources: { name: string; url: string }[];
}

interface Props {
  event: GeoEvent | null;
  open: boolean;
  onClose: () => void;
  onPickTicker: (sym: string) => void;
}

export default function EventDetailPanel({
  event,
  open,
  onClose,
  onPickTicker,
}: Props) {
  const [detail, setDetail] = useState<DetailResp | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!event || !open) return;
    setDetail(null);
    setLoading(true);
    const ctrl = new AbortController();
    fetch("/api/event-detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: event.id,
        title: event.title,
        region: event.region,
        severity: event.severity,
        source: event.source,
        url: event.url,
      }),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data: DetailResp) => setDetail(data))
      .catch((err) => {
        if ((err as { name?: string }).name !== "AbortError")
          console.warn("[event-detail] failed", err);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [event, open]);

  return (
    <div className={`event-panel ${open ? "open" : ""}`}>
      <div className="event-panel-inner">
        <div className="event-panel-header">
          <div className="event-panel-titles">
            <div className="title">{event?.title ?? ""}</div>
            <div className="meta">
              <span className="region">{event?.region ?? ""}</span>
              <span className={`severity ${event?.severity ?? "LOW"}`}>
                {event?.severity ?? ""}
              </span>
              <span className="src">{event?.source ?? ""}</span>
            </div>
          </div>
          <button
            type="button"
            className="event-panel-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="event-panel-body">
          {loading && !detail ? (
            <>
              <div className="skel" style={{ height: 60, width: "100%" }} />
              <div className="skel" style={{ height: 60, width: "100%", marginTop: 8 }} />
            </>
          ) : detail ? (
            <div className="event-panel-grid">
              <div className="event-col-l">
                <div className="block">
                  <div className="block-title">Summary</div>
                  <p>{detail.summary}</p>
                </div>
                <div className="block">
                  <div className="block-title">Background</div>
                  <p>{detail.background}</p>
                </div>
                <div className="block">
                  <div className="block-title">Timeline</div>
                  <p>{detail.timeline}</p>
                </div>
              </div>
              <div className="event-col-r">
                <div className="block">
                  <div className="block-title">Market Impact</div>
                  <p>{detail.market_impact}</p>
                </div>
                {detail.affected_stocks.length > 0 ? (
                  <div className="block">
                    <div className="block-title">Affected Stocks</div>
                    <div className="ticker-row">
                      {detail.affected_stocks.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="ticker-chip"
                          onClick={() => onPickTicker(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {detail.affected_sectors.length > 0 ? (
                  <div className="block">
                    <div className="block-title">Sectors</div>
                    <div className="sector-row">
                      {detail.affected_sectors.map((s) => (
                        <span key={s} className="sector-tag">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {detail.sources.length > 0 ? (
                  <div className="block">
                    <div className="block-title">Sources</div>
                    {detail.sources.map((s, i) => (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="src-link"
                      >
                        {s.name} ↗
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
