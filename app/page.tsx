"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import dynamic from "next/dynamic";
import TopBar from "@/components/TopBar";
import Watchlist from "@/components/Watchlist";
import EventFeed from "@/components/EventFeed";
import CenterPanel from "@/components/CenterPanel";
import Chatbot from "@/components/Chatbot";
import AskAIButton from "@/components/AskAIButton";
import StockDrawer from "@/components/StockDrawer";
import SettingsDrawer from "@/components/SettingsDrawer";
import MobileNav, { type MobileView } from "@/components/MobileNav";

// FooterBar reads `new Date()` and timezone data on first render so we keep
// it client-only — avoids SSR/CSR drift in the status pill countdowns.
const FooterBar = dynamic(() => import("@/components/FooterBar"), {
  ssr: false,
  loading: () => (
    <footer className="footer-bar" aria-hidden="true">
      <div className="exchange-pills" />
    </footer>
  ),
});
import { useSettings } from "@/lib/settings";
import { useWatchlists, allTrackedSymbolPairs } from "@/lib/watchlists";
import { resolveExchange, type ExchangeKey } from "@/lib/exchanges";
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
  const [mobileView, setMobileView] = useState<MobileView>("globe");

  const settings = useSettings();
  const watchlistState = useWatchlists();
  // v2: track sym:exchange pairs so the API can build the right Yahoo
  // ticker (.BO, .NS, etc.) for non-US rows.
  const symbolPairs = useMemo(
    () => allTrackedSymbolPairs(watchlistState),
    [watchlistState]
  );
  const symbolsKey = symbolPairs.join(",");
  const [focusExchange, setFocusExchange] = useState<ExchangeKey | null>(null);

  const seenEventsRef = useRef<Set<string>>(new Set());
  const lastPriceRef = useRef<Map<string, number>>(new Map());
  const mountedRef = useRef(true);

  const stocksRefreshMs =
    settings.stockRefreshSec === 0 ? 0 : settings.stockRefreshSec * 1000;
  const newsRefreshMs = settings.newsRefreshSec * 1000;

  const loadStocks = useCallback(async () => {
    try {
      // Read `symbolsKey` directly so the hook's dep array stays stable —
      // `symbolPairs.join(",")` would force a re-derive every render.
      const url = symbolsKey
        ? `/api/stocks?symbols=${encodeURIComponent(symbolsKey)}`
        : "/api/stocks?exchange=ALL";
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

  const drawerExchange: ExchangeKey =
    (drawerStock?.exchange as ExchangeKey | undefined) ??
    (drawerSym ? (resolveExchange(drawerSym) as ExchangeKey) : "NYSE");

  const highSeverityCount = useMemo(
    () => events.filter((e) => e.severity === "HIGH").length,
    [events]
  );
  const activeWatchlistCount = useMemo(() => {
    const list = watchlistState.lists.find(
      (l) => l.name === watchlistState.active
    );
    return list?.entries.length ?? 0;
  }, [watchlistState]);

  // When user picks an event from the right panel on mobile, jump to globe so
  // the focus animation + ring + bottom panel are actually visible.
  const handleEventSelect = useCallback(
    (e: GeoEvent) => {
      setFocusEvent(e);
      setMobileView("globe");
    },
    []
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

      <MobileNav
        value={mobileView}
        onChange={setMobileView}
        highSeverityCount={highSeverityCount}
        watchlistCount={activeWatchlistCount}
      />

      <div className="main-grid" data-mobile-view={mobileView}>
        <Watchlist
          stocks={stocks}
          events={events}
          loading={stocksLoading}
          selected={selectedSym}
          onSelect={openStockDrawer}
          onPickExchange={(k) => setFocusExchange(k)}
        />

        <CenterPanel
          events={events}
          stocks={stocks}
          focusEvent={focusEvent}
          focusExchange={focusExchange}
          onMarkerClick={(e) => setFocusEvent(e)}
          onCloseEventPanel={() => setFocusEvent(null)}
          onPickTicker={openStockDrawer}
        />

        <EventFeed
          events={events}
          loading={eventsLoading}
          error={eventsError}
          selectedId={focusEvent?.id ?? null}
          onSelect={handleEventSelect}
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
        exchange={drawerExchange}
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

      <FooterBar onPickExchange={(k) => setFocusExchange(k)} />
    </div>
  );
}
