"use client";

import * as React from "react";

import { readLocalStorageJson, writeLocalStorageJson } from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/storageKeys";

export type Theme = "light" | "dark";

type ThemeStore = {
  theme: Theme;
  updatedAt: string;
};

const DEFAULT_THEME: Theme = "light";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function readStoredTheme(): Theme {
  const raw = readLocalStorageJson<ThemeStore>(STORAGE_KEYS.theme);
  if (raw && isTheme(raw.theme)) return raw.theme;
  return DEFAULT_THEME;
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(DEFAULT_THEME);

  React.useEffect(() => {
    const initial = readStoredTheme();
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    writeLocalStorageJson(STORAGE_KEYS.theme, { theme: next, updatedAt: new Date().toISOString() } satisfies ThemeStore);
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = React.useMemo(() => ({ theme, setTheme, toggleTheme }), [setTheme, theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

