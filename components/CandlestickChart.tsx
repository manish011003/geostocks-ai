"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
  type UTCTimestamp,
  ColorType,
} from "lightweight-charts";

export interface OHLC {
  t: number; // unix ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface Props {
  bars: OHLC[];
  rsi?: number[]; // same length as bars (or shorter, NaNs padded)
  /** Tailwind-ish theme tokens come from CSS vars; we just pick text/border colors. */
  theme?: "dark" | "light";
}

function toTime(t: number): UTCTimestamp {
  return Math.floor(t / 1000) as UTCTimestamp;
}

function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export default function CandlestickChart({ bars, rsi, theme = "dark" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const text = readVar("--text", theme === "light" ? "#0f1a2c" : "#e8f0fe");
    const muted = readVar("--muted", "#5a7a9e");
    const border = readVar("--border", "#1e3050");
    const surface = readVar(
      "--surface",
      theme === "light" ? "#ffffff" : "#0d1520"
    );

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "transparent" },
        horzLines: { color: border, style: 0 },
      },
      rightPriceScale: { borderColor: border, textColor: muted },
      timeScale: { borderColor: border, timeVisible: false, secondsVisible: false },
      crosshair: { mode: 1 },
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: readVar("--green", "#00e676"),
      downColor: readVar("--red", "#ff5252"),
      borderUpColor: readVar("--green", "#00e676"),
      borderDownColor: readVar("--red", "#ff5252"),
      wickUpColor: readVar("--green", "#00e676"),
      wickDownColor: readVar("--red", "#ff5252"),
    });

    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
    });
    chart
      .priceScale("vol")
      .applyOptions({
        scaleMargins: { top: 0.78, bottom: 0 },
        borderColor: border,
      });

    const rsiLine = chart.addSeries(LineSeries, {
      priceScaleId: "rsi",
      color: readVar("--blue", "#4fc3f7"),
      lineWidth: 1,
      lastValueVisible: true,
      priceLineVisible: false,
    });
    chart
      .priceScale("rsi")
      .applyOptions({
        scaleMargins: { top: 0.92, bottom: 0 },
        borderColor: border,
      });

    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;
    rsiRef.current = rsiLine;

    void surface; // (kept readable; surface used implicitly via parent panel bg)

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      rsiRef.current = null;
    };
  }, [theme]);

  // Push data when bars change
  useEffect(() => {
    const candle = candleRef.current;
    const vol = volRef.current;
    const rsiLine = rsiRef.current;
    if (!candle || !vol || !rsiLine) return;
    if (bars.length === 0) {
      candle.setData([]);
      vol.setData([]);
      rsiLine.setData([]);
      return;
    }

    const candleData: CandlestickData<Time>[] = bars.map((b) => ({
      time: toTime(b.t),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
    }));
    candle.setData(candleData);

    const upColor = readVar("--green", "#00e676");
    const dnColor = readVar("--red", "#ff5252");
    const volData: HistogramData<Time>[] = bars.map((b, i) => ({
      time: toTime(b.t),
      value: b.v,
      color:
        i > 0 && b.c < bars[i - 1].c
          ? `${dnColor}55`
          : `${upColor}55`,
    }));
    vol.setData(volData);

    if (rsi && rsi.length > 0) {
      const rsiData: LineData<Time>[] = bars
        .map((b, i) => ({
          time: toTime(b.t),
          value: rsi[i] ?? NaN,
        }))
        .filter((p) => Number.isFinite(p.value));
      rsiLine.setData(rsiData);
    } else {
      rsiLine.setData([]);
    }

    chartRef.current?.timeScale().fitContent();
  }, [bars, rsi]);

  return <div ref={containerRef} className="candle-chart" />;
}
