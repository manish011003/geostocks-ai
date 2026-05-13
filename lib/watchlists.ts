"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  EXCHANGES,
  detectExchangeFromYahooSymbol,
  resolveExchange,
  type ExchangeKey,
} from "@/lib/exchanges";

export interface WatchlistEntry {
  sym: string;
  name?: string;
  /** v2: our exchange key (NYSE | NASDAQ | BSE | NSE | LSE | TSE | SSE | EURONEXT). */
  exchange?: string;
  /** ISO country code (US, IN, GB, ...). Optional cosmetic field. */
  country?: string;
  sector?: string;
  /** Native currency for prices in this row, e.g. "INR", "USD", "GBP". */
  currency?: string;
}

export interface Watchlist {
  name: string;
  entries: WatchlistEntry[];
}

export type ExchangeFilter = "ALL" | ExchangeKey;

interface WatchlistState {
  lists: Watchlist[];
  active: string;
  /** v2: which exchange the user is filtering the dashboard by. */
  exchangeFilter: ExchangeFilter;
  /** v2: whether the watchlist should group rows under exchange headers. */
  groupByExchange: boolean;
}

interface WatchlistActions {
  setActive: (name: string) => void;
  createList: (name: string) => void;
  renameList: (oldName: string, newName: string) => void;
  removeList: (name: string) => void;
  addStock: (listName: string, entry: WatchlistEntry) => void;
  removeStock: (listName: string, sym: string) => void;
  reorder: (listName: string, fromIndex: number, toIndex: number) => void;
  setExchangeFilter: (filter: ExchangeFilter) => void;
  setGroupByExchange: (on: boolean) => void;
  exportCsv: () => string;
  resetDefaults: () => void;
}

/** Helper to stamp exchange/currency on a partial entry. */
function enrich(entry: Partial<WatchlistEntry> & { sym: string }): WatchlistEntry {
  const sym = entry.sym.toUpperCase();
  const exchangeKey =
    (entry.exchange as ExchangeKey | undefined) ?? resolveExchange(sym);
  const ex = EXCHANGES[exchangeKey] ?? EXCHANGES.NYSE;
  return {
    sym,
    name: entry.name,
    sector: entry.sector,
    exchange: ex.key,
    country: entry.country ?? ex.country,
    currency: entry.currency ?? ex.currency,
  };
}

const US_DEFAULTS: WatchlistEntry[] = [
  enrich({ sym: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", sector: "tech" }),
  enrich({ sym: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ", sector: "tech" }),
  enrich({ sym: "XOM", name: "Exxon Mobil", exchange: "NYSE", sector: "energy" }),
  enrich({ sym: "LMT", name: "Lockheed Martin", exchange: "NYSE", sector: "defense" }),
  enrich({ sym: "NVDA", name: "NVIDIA Corp.", exchange: "NASDAQ", sector: "tech" }),
  enrich({ sym: "BA", name: "Boeing Co.", exchange: "NYSE", sector: "defense" }),
  enrich({ sym: "CVX", name: "Chevron Corp.", exchange: "NYSE", sector: "energy" }),
];

const INDIA_DEFAULTS: WatchlistEntry[] = [
  enrich({ sym: "RELIANCE", name: "Reliance Industries", exchange: "BSE", sector: "energy" }),
  enrich({ sym: "TCS", name: "Tata Consultancy", exchange: "BSE", sector: "tech" }),
  enrich({ sym: "HDFCBANK", name: "HDFC Bank", exchange: "BSE", sector: "finance" }),
  enrich({ sym: "INFY", name: "Infosys", exchange: "BSE", sector: "tech" }),
  enrich({ sym: "TATAMOTORS", name: "Tata Motors", exchange: "NSE", sector: "auto" }),
  enrich({ sym: "BAJFINANCE", name: "Bajaj Finance", exchange: "NSE", sector: "finance" }),
];

const GLOBAL_DEFAULTS: WatchlistEntry[] = [
  enrich({ sym: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", sector: "tech" }),
  enrich({ sym: "RELIANCE", name: "Reliance Industries", exchange: "BSE", sector: "energy" }),
  enrich({ sym: "SHEL", name: "Shell", exchange: "LSE", sector: "energy" }),
  enrich({ sym: "7203", name: "Toyota", exchange: "TSE", sector: "auto" }),
  enrich({ sym: "MC", name: "LVMH", exchange: "EURONEXT", sector: "luxury" }),
  enrich({ sym: "600519", name: "Kweichow Moutai", exchange: "SSE", sector: "consumer" }),
  enrich({ sym: "NVDA", name: "NVIDIA Corp.", exchange: "NASDAQ", sector: "tech" }),
];

const DEFENSE_ENTRIES: WatchlistEntry[] = [
  enrich({ sym: "LMT", name: "Lockheed Martin", exchange: "NYSE", sector: "defense" }),
  enrich({ sym: "BA", name: "Boeing Co.", exchange: "NYSE", sector: "defense" }),
  enrich({ sym: "RTX", name: "RTX Corp.", exchange: "NYSE", sector: "defense" }),
  enrich({ sym: "GD", name: "General Dynamics", exchange: "NYSE", sector: "defense" }),
];

const DEFAULTS: WatchlistState = {
  lists: [
    { name: "Global", entries: GLOBAL_DEFAULTS },
    { name: "US", entries: US_DEFAULTS },
    { name: "India", entries: INDIA_DEFAULTS },
    { name: "Defense", entries: DEFENSE_ENTRIES },
  ],
  active: "Global",
  exchangeFilter: "ALL",
  groupByExchange: false,
};

const MAX_PER_LIST = 30;

export const useWatchlists = create<WatchlistState & WatchlistActions>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      setActive: (name) => {
        if (get().lists.some((l) => l.name === name)) set({ active: name });
      },

      createList: (rawName) => {
        const name = rawName.trim();
        if (!name) return;
        const lists = get().lists;
        if (lists.some((l) => l.name === name)) {
          set({ active: name });
          return;
        }
        set({
          lists: [...lists, { name, entries: [] }],
          active: name,
        });
      },

      renameList: (oldName, newRaw) => {
        const newName = newRaw.trim();
        if (!newName) return;
        const lists = get().lists.map((l) =>
          l.name === oldName ? { ...l, name: newName } : l
        );
        set({
          lists,
          active: get().active === oldName ? newName : get().active,
        });
      },

      removeList: (name) => {
        const lists = get().lists.filter((l) => l.name !== name);
        if (lists.length === 0) lists.push({ name: "Watchlist", entries: [] });
        set({
          lists,
          active: lists.find((l) => l.name === get().active)
            ? get().active
            : lists[0].name,
        });
      },

      addStock: (listName, entry) => {
        const enriched = enrich(entry);
        set({
          lists: get().lists.map((l) => {
            if (l.name !== listName) return l;
            // Same symbol on same exchange = dupe
            if (
              l.entries.some(
                (e) =>
                  e.sym === enriched.sym &&
                  (e.exchange ?? "") === (enriched.exchange ?? "")
              )
            )
              return l;
            if (l.entries.length >= MAX_PER_LIST) return l;
            return { ...l, entries: [...l.entries, enriched] };
          }),
        });
      },

      removeStock: (listName, sym) => {
        set({
          lists: get().lists.map((l) =>
            l.name === listName
              ? { ...l, entries: l.entries.filter((e) => e.sym !== sym) }
              : l
          ),
        });
      },

      reorder: (listName, fromIndex, toIndex) => {
        set({
          lists: get().lists.map((l) => {
            if (l.name !== listName) return l;
            const entries = [...l.entries];
            const [moved] = entries.splice(fromIndex, 1);
            if (!moved) return l;
            entries.splice(toIndex, 0, moved);
            return { ...l, entries };
          }),
        });
      },

      setExchangeFilter: (filter) => set({ exchangeFilter: filter }),
      setGroupByExchange: (on) => set({ groupByExchange: on }),

      exportCsv: () => {
        const rows: string[] = [
          "list,sym,name,exchange,country,sector,currency",
        ];
        for (const l of get().lists) {
          for (const e of l.entries) {
            rows.push(
              [
                l.name,
                e.sym,
                e.name ?? "",
                e.exchange ?? "",
                e.country ?? "",
                e.sector ?? "",
                e.currency ?? "",
              ]
                .map((v) => `"${String(v).replaceAll('"', '""')}"`)
                .join(",")
            );
          }
        }
        return rows.join("\n");
      },

      resetDefaults: () => set({ ...DEFAULTS }),
    }),
    {
      // bump key to v2 so old v1 watchlists migrate cleanly instead of
      // resurrecting stale `exchange: "NYQ"` Yahoo-style strings.
      name: "geostock-watchlists-v2",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      partialize: (s) => ({
        lists: s.lists,
        active: s.active,
        exchangeFilter: s.exchangeFilter,
        groupByExchange: s.groupByExchange,
      }),
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") return DEFAULTS;
        const s = persistedState as Partial<WatchlistState>;
        // v1 stored Yahoo-style "NYQ"/"NMS"/"NSE" strings on `exchange`.
        // Translate those to our normalised keys and stamp currency.
        const lists = (s.lists ?? DEFAULTS.lists).map((l) => ({
          name: l.name,
          entries: (l.entries ?? []).map((e) => {
            const yahooEx = (e.exchange ?? "").toUpperCase();
            let key: ExchangeKey | undefined;
            if (yahooEx === "NYQ" || yahooEx === "ARCA") key = "NYSE";
            else if (yahooEx === "NMS" || yahooEx === "NCM") key = "NASDAQ";
            else if (yahooEx === "NSE" || yahooEx === "NSI") key = "NSE";
            else if (yahooEx === "BSE" || yahooEx === "BOM") key = "BSE";
            else if (EXCHANGES[yahooEx as ExchangeKey]) key = yahooEx as ExchangeKey;
            else {
              key =
                detectExchangeFromYahooSymbol(e.sym) ??
                resolveExchange(e.sym);
            }
            return enrich({ ...e, exchange: key });
          }),
        }));
        return {
          lists,
          active: s.active ?? DEFAULTS.active,
          exchangeFilter: s.exchangeFilter ?? DEFAULTS.exchangeFilter,
          groupByExchange: s.groupByExchange ?? DEFAULTS.groupByExchange,
        } as WatchlistState & WatchlistActions;
      },
    }
  )
);

export function activeList(state: WatchlistState): Watchlist {
  return (
    state.lists.find((l) => l.name === state.active) ??
    state.lists[0] ?? { name: "Watchlist", entries: [] }
  );
}

/** Returns the de-duped list of bare symbols (no exchange suffixes) tracked
 *  across every list. v1 callers still get plain ticker strings. */
export function allTrackedSymbols(state: WatchlistState): string[] {
  const set = new Set<string>();
  for (const l of state.lists) for (const e of l.entries) set.add(e.sym);
  return Array.from(set);
}

/** v2: returns `sym:EXCHANGE` strings (deduped) across every list. These
 *  are what the upgraded /api/stocks route expects so it can build the
 *  right Yahoo ticker per row. */
export function allTrackedSymbolPairs(state: WatchlistState): string[] {
  const set = new Set<string>();
  for (const l of state.lists) {
    for (const e of l.entries) {
      const ex = (e.exchange ?? resolveExchange(e.sym)) as ExchangeKey;
      set.add(`${e.sym}:${ex}`);
    }
  }
  return Array.from(set);
}

/** Symbols in the *visible* list after applying the exchange filter. */
export function visibleEntries(state: WatchlistState): WatchlistEntry[] {
  const list = activeList(state);
  if (state.exchangeFilter === "ALL") return list.entries;
  return list.entries.filter(
    (e) => (e.exchange ?? resolveExchange(e.sym)) === state.exchangeFilter
  );
}
