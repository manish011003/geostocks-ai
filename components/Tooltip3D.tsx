"use client";

import type { GeoEvent } from "@/types";

interface Props {
  event: GeoEvent;
  x: number;
  y: number;
}

/**
 * Floating tooltip card meant to be positioned absolutely over the globe
 * canvas. Currently used inline by Globe.tsx but exported for re-use.
 */
export default function Tooltip3D({ event, x, y }: Props) {
  return (
    <div className="globe-tooltip" style={{ left: x, top: y }}>
      <div className="title">{event.title}</div>
      <div className="meta">
        <span>{event.region}</span>
        <span className={`severity ${event.severity}`}>{event.severity}</span>
      </div>
    </div>
  );
}
