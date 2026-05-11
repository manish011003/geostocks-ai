"use client";

import { useId, useMemo } from "react";

interface Props {
  data: number[];
  positive?: boolean;
  height?: number;
  width?: number;
}

/**
 * Lightweight SVG sparkline — no external deps. Chosen over recharts for the
 * tiny watchlist sparklines because we only need a polyline + gradient.
 */
export default function StockChart({
  data,
  positive = true,
  height = 22,
  width = 90,
}: Props) {
  const reactId = useId();
  const path = useMemo(() => {
    if (!data || data.length < 2) return { d: "", area: "" };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const stepX = width / (data.length - 1);

    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * (height - 2) - 1;
      return [x, y] as const;
    });

    const d = points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");

    const area = `${d} L${width.toFixed(1)},${height} L0,${height} Z`;
    return { d, area };
  }, [data, height, width]);

  if (!data || data.length < 2) {
    return <div className="spark" style={{ height, width: "100%" }} />;
  }

  const stroke = positive ? "var(--green)" : "var(--red)";
  const fill = positive ? "rgba(0,230,118,0.18)" : "rgba(255,82,82,0.18)";
  const gradId = `spark-${reactId.replace(/:/g, "")}-${positive ? "u" : "d"}`;

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gradId})`} />
      <path
        d={path.d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
