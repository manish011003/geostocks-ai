"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface WatchlistEntry {
  sym: string;
  name?: string;
  exchange?: string;
  country?: string;
  sector?: string;
}

export interface Watchlist {
  name: string;
  entries: WatchlistEntry[];
}

interface WatchlistState {
  lists: Watchlist[];
  active: string;
}

interface WatchlistActions {
  setActive: (name: string) => void;
  createList: (name: string) => void;
  renameList: (oldName: string, newName: string) => void;
  removeList: (name: string) => void;
  addStock: (listName: string, entry: WatchlistEntry) => void;
  removeStock: (listName: string, sym: string) => void;
  reorder: (listName: string, fromIndex: number, toIndex: number) => void;
  exportCsv: () => string;
  resetDefaults: () => void;
}

const DEFAULT_ENTRIES: WatchlistEntry[] = [
  { sym: "AAPL", name: "Apple Inc.", exchange: "NMS", country: "US", sector: "tech" },
  { sym: "TSLA", name: "Tesla Inc.", exchange: "NMS", country: "US", sector: "tech" },
  { sym: "XOM", name: "Exxon Mobil", exchange: "NYQ", country: "US", sector: "energy" },
  { sym: "LMT", name: "Lockheed Martin", exchange: "NYQ", country: "US", sector: "defense" },
  { sym: "NVDA", name: "NVIDIA Corp.", exchange: "NMS", country: "US", sector: "tech" },
  { sym: "BA", name: "Boeing Co.", exchange: "NYQ", country: "US", sector: "defense" },
  { sym: "CVX", name: "Chevron Corp.", exchange: "NYQ", country: "US", sector: "energy" },
  { sym: "GOLD", name: "Barrick Gold", exchange: "NYQ", country: "US", sector: "commodities" },
];

const COMMODITIES_ENTRIES: WatchlistEntry[] = [
  { sym: "GOLD", name: "Barrick Gold", exchange: "NYQ", country: "US", sector: "commodities" },
  { sym: "FCX", name: "Freeport-McMoRan", exchange: "NYQ", country: "US", sector: "commodities" },
  { sym: "XOM", name: "Exxon Mobil", exchange: "NYQ", country: "US", sector: "energy" },
  { sym: "CVX", name: "Chevron Corp.", exchange: "NYQ", country: "US", sector: "energy" },
];

const DEFENSE_ENTRIES: WatchlistEntry[] = [
  { sym: "LMT", name: "Lockheed Martin", exchange: "NYQ", country: "US", sector: "defense" },
  { sym: "BA", name: "Boeing Co.", exchange: "NYQ", country: "US", sector: "defense" },
  { sym: "RTX", name: "RTX Corp.", exchange: "NYQ", country: "US", sector: "defense" },
  { sym: "GD", name: "General Dynamics", exchange: "NYQ", country: "US", sector: "defense" },
];

const DEFAULTS: WatchlistState = {
  lists: [
    { name: "Watchlist", entries: DEFAULT_ENTRIES },
    { name: "Commodities", entries: COMMODITIES_ENTRIES },
    { name: "Defense", entries: DEFENSE_ENTRIES },
  ],
  active: "Watchlist",
};

const MAX_PER_LIST = 20;

export const useWatchlists = create<
  WatchlistState & WatchlistActions
>()(
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
        const sym = entry.sym.toUpperCase();
        set({
          lists: get().lists.map((l) => {
            if (l.name !== listName) return l;
            if (l.entries.some((e) => e.sym === sym)) return l;
            if (l.entries.length >= MAX_PER_LIST) return l;
            return { ...l, entries: [...l.entries, { ...entry, sym }] };
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

      exportCsv: () => {
        const rows: string[] = ["list,sym,name,exchange,country,sector"];
        for (const l of get().lists) {
          for (const e of l.entries) {
            rows.push(
              [l.name, e.sym, e.name ?? "", e.exchange ?? "", e.country ?? "", e.sector ?? ""]
                .map((v) => `"${String(v).replaceAll('"', '""')}"`)
                .join(",")
            );
          }
        }
        return rows.join("\n");
      },

      resetDefaults: () => set(DEFAULTS),
    }),
    {
      name: "geostock-watchlists-v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ lists: s.lists, active: s.active }),
    }
  )
);

export function activeList(state: WatchlistState): Watchlist {
  return (
    state.lists.find((l) => l.name === state.active) ??
    state.lists[0] ?? { name: "Watchlist", entries: [] }
  );
}

export function allTrackedSymbols(state: WatchlistState): string[] {
  const set = new Set<string>();
  for (const l of state.lists) for (const e of l.entries) set.add(e.sym);
  return Array.from(set);
}
