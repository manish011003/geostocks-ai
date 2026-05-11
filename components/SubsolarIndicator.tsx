"use client";

import { useEffect, useState } from "react";
import { solarPosition } from "@/lib/sun";

function fmtLat(lat: number) {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`;
}
function fmtLon(lon: number) {
  // Normalize to [-180, 180]
  let l = lon;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return `${Math.abs(l).toFixed(1)}°${l >= 0 ? "E" : "W"}`;
}

export default function SubsolarIndicator() {
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    setPos(solarPosition(new Date()));
    const id = setInterval(() => setPos(solarPosition(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!pos) {
    return (
      <span className="key">
        <span className="sun-glyph" aria-hidden />
        SUN ·············
      </span>
    );
  }

  return (
    <span className="key" title="Subsolar point — where the sun is overhead">
      <span className="sun-glyph" aria-hidden />
      SUN · {fmtLat(pos.lat)} {fmtLon(pos.lon)}
    </span>
  );
}
