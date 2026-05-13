"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { EXCHANGE_KEYS, type ExchangeKey } from "@/lib/exchanges";

export type ThemeMode = "dark" | "light" | "auto";
export type GlobeTexture = "earth-night" | "earth-day" | "minimal";
export type TickerSpeed = "slow" | "normal" | "fast";
export type ChartTimeframe = "1D" | "1W" | "1M";
export type StockRefresh = 30 | 60 | 300 | 0; // 0 = manual
export type NewsRefresh = 300 | 600 | 1800;
export type CurrencyDisplay = "Native" | "USD" | "Both";
/** v1 alias retained for back-compat of older code paths. */
export type LegacyCurrencyDisplay = "USD" | "Local";

export type DefaultExchangeView = "ALL" | ExchangeKey;
export type DualBSEPref = "BSE" | "NSE" | "BOTH";

export interface SettingsState {
  // Appearance
  theme: ThemeMode;
  globeTexture: GlobeTexture;
  tickerSpeed: TickerSpeed;
  chartDefaultTimeframe: ChartTimeframe;

  // Data
  stockRefreshSec: StockRefresh;
  newsRefreshSec: NewsRefresh;
  showPrePostMarket: boolean;
  currencyDisplay: CurrencyDisplay;

  // Globe
  autoRotate: boolean;
  rotationSpeed: number; // 0.1 - 2.0
  showMarkers: boolean;
  showCountryBorders: boolean;
  markerPulse: boolean;

  // Notifications
  highSeverityAlerts: boolean;
  priceAlertPct: number; // % move that triggers an alert
  soundAlerts: boolean;

  // v2: Exchange preferences
  defaultExchangeView: DefaultExchangeView;
  visibleExchanges: ExchangeKey[];
  /** When ON, show IST times in footer + drawer for Indian exchanges. */
  showIST: boolean;
  /** When a stock exists on both BSE and NSE, which one (or both) to fetch. */
  dualIndianPref: DualBSEPref;

  // User
  displayName: string;
}

interface SettingsActions {
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  reset: () => void;
  exportJson: () => string;
  importJson: (json: string) => void;
}

const DEFAULTS: SettingsState = {
  theme: "dark",
  globeTexture: "earth-night",
  tickerSpeed: "normal",
  chartDefaultTimeframe: "1M",

  stockRefreshSec: 60,
  newsRefreshSec: 600,
  showPrePostMarket: true,
  currencyDisplay: "Native",

  autoRotate: true,
  rotationSpeed: 0.4,
  showMarkers: true,
  showCountryBorders: false,
  markerPulse: true,

  highSeverityAlerts: true,
  priceAlertPct: 3,
  soundAlerts: false,

  defaultExchangeView: "ALL",
  visibleExchanges: [...EXCHANGE_KEYS],
  showIST: false,
  dualIndianPref: "BOTH",

  displayName: "",
};

export const useSettings = create<SettingsState & SettingsActions>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      reset: () => set({ ...DEFAULTS }),
      exportJson: () => JSON.stringify(get(), null, 2),
      importJson: (json) => {
        try {
          const parsed = JSON.parse(json) as Partial<SettingsState>;
          set({ ...DEFAULTS, ...parsed });
        } catch (err) {
          console.warn("[settings] import failed", err);
        }
      },
    }),
    {
      name: "geostock-settings-v2",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      partialize: (s) => {
        const {
          set: _set,
          reset: _reset,
          exportJson: _exportJson,
          importJson: _importJson,
          ...rest
        } = s;
        return rest;
      },
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object")
          return DEFAULTS;
        // The v1 shape allowed `currencyDisplay: "USD" | "Local"`, neither
        // of which overlaps the v2 union directly, so we deliberately strip
        // the field type before comparing.
        const s = persistedState as Omit<
          Partial<SettingsState>,
          "currencyDisplay"
        > & { currencyDisplay?: string };
        let currencyDisplay: CurrencyDisplay = DEFAULTS.currencyDisplay;
        if (s.currencyDisplay === "USD") currencyDisplay = "USD";
        else if (s.currencyDisplay === "Local") currencyDisplay = "Native";
        else if (
          s.currencyDisplay === "Native" ||
          s.currencyDisplay === "Both"
        )
          currencyDisplay = s.currencyDisplay;
        return {
          ...DEFAULTS,
          ...s,
          currencyDisplay,
        } as SettingsState;
      },
    }
  )
);

/** Resolve `theme: "auto"` to either `"dark"` or `"light"` based on the user
 *  agent's preference. SSR-safe: returns `dark` on the server. */
export function resolveTheme(theme: ThemeMode): "dark" | "light" {
  if (theme !== "auto") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export const tickerDurationSec = (speed: TickerSpeed): number => {
  if (speed === "slow") return 90;
  if (speed === "fast") return 25;
  return 60;
};
