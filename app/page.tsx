"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import TopBar from "@/components/TopBar";
import Watchlist from "@/components/Watchlist";
import EventFeed from "@/components/EventFeed";
import CenterPanel from "@/components/CenterPanel";
import Chatbot from "@/components/Chatbot";
import AskAIButton from "@/components/AskAIButton";
import StockDrawer from "@/components/StockDrawer";
import SettingsDrawer from "@/components/SettingsDrawer";
import { useSettings } from "@/lib/settings";
import { useWatchlists, allTrackedSymbols } from "@/lib/watchlists";
import type { GeoEvent, StockData } from "@/types";

interface StocksResponse {
  stocks: StockData[];
  cached?: boolean;
  fallback?: boolean;
  error?: string;
}

interface NewsResponse {
  events: GeoEvent[];
  cached?: boolean;
  fallback?: boolean;
  error?: string;
}

export default function Dashboard() {
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [events, setEvents] = useState<GeoEvent[]>([]);
  const [stocksLoading, setStocksLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [selectedSym, setSelectedSym] = useState<string | null>(null);
  const [drawerSym, setDrawerSym] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusEvent, setFocusEvent] = useState<GeoEvent | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settings = useSettings();
  const watchlistState = useWatchlists();
  const symbols = useMemo(
    () => allTrackedSymbols(watchlistState),
    [watchlistState]
  );
  const symbolsKey = symbols.join(",");

  const seenEventsRef = useRef<Set<string>>(new Set());
  const lastPriceRef = useRef<Map<string, number>>(new Map());
  const mountedRef = useRef(true);

  const stocksRefreshMs =
    settings.stockRefreshSec === 0 ? 0 : settings.stockRefreshSec * 1000;
  const newsRefreshMs = settings.newsRefreshSec * 1000;

  const loadStocks = useCallback(async () => {
    try {
      const url =
        symbols.length > 0
          ? `/api/stocks?symbols=${encodeURIComponent(symbols.join(","))}`
          : "/api/stocks";
      const res = await fetch(url, { cache: "no-store" });
      const data = (await res.json()) as StocksResponse;
      if (!mountedRef.current) return;
      const next = data.stocks ?? [];
      // Price alerts
      if (settings.highSeverityAlerts) {
        for (const s of next) {
          const last = lastPriceRef.current.get(s.sym);
          if (
            last !== undefined &&
            last > 0 &&
            Math.abs((s.price - last) / last) * 100 >= settings.priceAlertPct
          ) {
            const dir = s.price > last ? "▲" : "▼";
            toast(
              `${dir} ${s.sym} moved ${(((s.price - last) / last) * 100).toFixed(2)}%`,
              { icon: "📈", duration: 5000 }
            );
          }
          lastPriceRef.current.set(s.sym, s.price);
        }
      } else {
        for (const s of next) lastPriceRef.current.set(s.sym, s.price);
      }
      setStocks(next);
    } catch (err) {
      console.warn("[ui] /api/stocks failed", err);
    } finally {
      if (mountedRef.current) setStocksLoading(false);
    }
  }, [symbolsKey, settings.priceAlertPct, settings.highSeverityAlerts]);

  const loadNews = useCallback(async () => {
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      const data = (await res.json()) as NewsResponse;
      if (!mountedRef.current) return;
      const next = data.events ?? [];

      // Toast new HIGH severity events
      if (settings.highSeverityAlerts && seenEventsRef.current.size > 0) {
        for (const e of next) {
          if (e.severity === "HIGH" && !seenEventsRef.current.has(e.id)) {
            toast.custom(
              (t) => (
                <div
                  className={`event-toast ${t.visible ? "show" : ""}`}
                  onClick={() => {
                    setFocusEvent(e);
                    toast.dismiss(t.id);
                  }}
                >
                  <span className="badge-high">HIGH</span>
                  <span className="t-title">{e.title}</span>
                  <span className="t-region">{e.region}</span>
                </div>
              ),
              { duration: 6000 }
            );
          }
        }
      }
      for (const e of next) seenEventsRef.current.add(e.id);

      setEvents(next);
      setEventsError(
        data.fallback
          ? "Using offline event sample (set GNEWS_API_KEY for live news)"
          : null
      );
    } catch (err) {
      console.warn("[ui] /api/news failed", err);
      if (mountedRef.current)
        setEventsError("Failed to load events — retrying soon");
    } finally {
      if (mountedRef.current) setEventsLoading(false);
    }
  }, [settings.highSeverityAlerts]);

  useEffect(() => {
    mountedRef.current = true;
    void Promise.all([loadStocks(), loadNews()]);
    return () => {
      mountedRef.current = false;
    };
  }, [loadStocks, loadNews]);

  useEffect(() => {
    if (stocksRefreshMs <= 0) return;
    const id = setInterval(loadStocks, stocksRefreshMs);
    return () => clearInterval(id);
  }, [loadStocks, stocksRefreshMs]);

  useEffect(() => {
    const id = setInterval(loadNews, newsRefreshMs);
    return () => clearInterval(id);
  }, [loadNews, newsRefreshMs]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setChatOpen((v) => !v);
      } else if (e.key === "Escape") {
        if (chatOpen) setChatOpen(false);
        else if (drawerOpen) setDrawerOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (focusEvent) setFocusEvent(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen, drawerOpen, settingsOpen, focusEvent]);

  const openStockDrawer = useCallback((sym: string) => {
    setDrawerSym(sym);
    setDrawerOpen(true);
    setSelectedSym(sym);
  }, []);

  const drawerStock = useMemo(
    () =>
      drawerSym
        ? (stocks.find((s) => s.sym.toUpperCase() === drawerSym.toUpperCase()) ??
          null)
        : null,
    [drawerSym, stocks]
  );

  return (
    <div className="shell">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            fontSize: "11px",
          },
        }}
      />
      <TopBar
        stocks={stocks}
        onOpenSettings={() => setSettingsOpen(true)}
        onTickerClick={openStockDrawer}
      />

      <div className="main-grid">
        <Watchlist
          stocks={stocks}
          events={events}
          loading={stocksLoading}
          selected={selectedSym}
          onSelect={openStockDrawer}
        />

        <CenterPanel
          events={events}
          stocks={stocks}
          focusEvent={focusEvent}
          onMarkerClick={(e) => setFocusEvent(e)}
          onCloseEventPanel={() => setFocusEvent(null)}
          onPickTicker={openStockDrawer}
        />

        <EventFeed
          events={events}
          loading={eventsLoading}
          error={eventsError}
          selectedId={focusEvent?.id ?? null}
          onSelect={(e) => setFocusEvent(e)}
        />
      </div>

      <AskAIButton onClick={() => setChatOpen(true)} />
      <Chatbot
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        selectedTicker={selectedSym}
      />
      <StockDrawer
        ticker={drawerSym}
        stock={drawerStock}
        events={events}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelectTicker={openStockDrawer}
      />
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
