"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import { ThemeContext } from "./theme-provider";

type ThemeToggleProps = {
  className?: string;
};

function readDocumentDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Works with packages/ui ThemeProvider when mounted; otherwise toggles the
 * document `dark` class so it stays compatible with app-level next-themes
 * (or any provider that drives `html.dark`).
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const ctx = useContext(ThemeContext);
  const [fallbackDark, setFallbackDark] = useState(false);

  useEffect(() => {
    if (ctx) return;
    setFallbackDark(readDocumentDark());
  }, [ctx]);

  const fallbackToggle = useCallback(() => {
    const root = document.documentElement;
    const nextDark = !root.classList.contains("dark");
    root.classList.toggle("dark", nextDark);
    root.style.colorScheme = nextDark ? "dark" : "light";
    try {
      // Match apps/web next-themes `storageKey` so reloads keep the choice.
      localStorage.setItem(
        "atmos:v1:global:theme",
        nextDark ? "dark" : "light",
      );
    } catch {
      /* ignore */
    }
    setFallbackDark(nextDark);
  }, []);

  const isDark = ctx ? ctx.resolved === "dark" : fallbackDark;
  const onToggle = ctx ? ctx.toggleLightDark : fallbackToggle;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={onToggle}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
