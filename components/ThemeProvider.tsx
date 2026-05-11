"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSettings, resolveTheme } from "@/lib/settings";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeMode = useSettings((s) => s.theme);
  const setMode = useSettings((s) => s.set);
  const [theme, setThemeState] = useState<Theme>("dark");

  // Resolve the user's mode (dark/light/auto) into a concrete theme
  useEffect(() => {
    const apply = () => {
      const resolved = resolveTheme(themeMode);
      setThemeState(resolved);
      document.documentElement.dataset.theme = resolved;
    };
    apply();

    // Re-resolve on system preference change when in "auto"
    if (themeMode === "auto" && typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const onChange = () => apply();
      mq.addEventListener?.("change", onChange);
      return () => mq.removeEventListener?.("change", onChange);
    }
  }, [themeMode]);

  const setTheme = useCallback(
    (t: Theme) => {
      setMode("theme", t);
    },
    [setMode]
  );

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggle }),
    [theme, setTheme, toggle]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "dark",
      setTheme: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
