"use client";

import * as React from "react";
import {
  DEFAULT_THEME,
  RESOLVED_THEMES,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: "class";
  defaultTheme?: Theme;
  disableTransitionOnChange?: boolean;
  enableSystem?: boolean;
  storageKey?: string;
};

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = DEFAULT_THEME,
  disableTransitionOnChange = false,
  enableSystem = true,
  storageKey = THEME_STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>("light");

  React.useEffect(() => {
    const storedTheme = readStoredTheme(storageKey);
    const nextTheme = storedTheme ?? defaultTheme;
    setThemeState(nextTheme);
    const nextResolvedTheme = resolveTheme(nextTheme, enableSystem);
    setResolvedTheme(nextResolvedTheme);
    applyTheme(attribute, nextResolvedTheme);
  }, [attribute, defaultTheme, enableSystem, storageKey]);

  React.useEffect(() => {
    if (!enableSystem) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setResolvedTheme((currentResolvedTheme) => {
        if (theme !== "system") return currentResolvedTheme;

        const nextResolvedTheme = mediaQuery.matches ? "dark" : "light";
        applyTheme(attribute, nextResolvedTheme);
        return nextResolvedTheme;
      });
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [attribute, enableSystem, theme]);

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      setThemeState(nextTheme);

      try {
        window.localStorage.setItem(storageKey, nextTheme);
      } catch {}

      const nextResolvedTheme = resolveTheme(nextTheme, enableSystem);

      if (disableTransitionOnChange) {
        disableTransitionsTemporarily();
      }

      setResolvedTheme(nextResolvedTheme);
      applyTheme(attribute, nextResolvedTheme);
    },
    [attribute, disableTransitionOnChange, enableSystem, storageKey]
  );

  const value = React.useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}

function readStoredTheme(storageKey: string): Theme | null {
  try {
    const storedTheme = window.localStorage.getItem(storageKey);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function resolveTheme(theme: Theme, enableSystem: boolean): ResolvedTheme {
  if (theme === "system") {
    if (!enableSystem) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return RESOLVED_THEMES.includes(theme) ? theme : "light";
}

function applyTheme(attribute: "class", theme: ResolvedTheme) {
  const root = document.documentElement;

  if (attribute === "class") {
    root.classList.remove(...RESOLVED_THEMES);
    root.classList.add(theme);
  }

  root.style.colorScheme = theme;
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode("*{transition:none!important}")
  );
  document.head.appendChild(style);

  void window.getComputedStyle(document.body);

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      style.remove();
    });
  });
}
