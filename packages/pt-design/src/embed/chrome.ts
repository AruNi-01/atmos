/** Atmos center `--background` in dark (`oklch(0.141 0.005 285.823)`). Not sidebar `#18181b`. */
export const ATMOS_DARK_CANVAS = "#09090b";
export const ATMOS_LIGHT_CANVAS = "#ffffff";
/** Atmos `--card` / `--sidebar` in dark (`oklch(0.21 0.006 285.885)`). */
export const ATMOS_DARK_CARD = "#18181b";

export type ChromeTokens = {
  bg: string;
  fg: string;
  card: string;
  border: string;
  muted: string;
  mutedFg: string;
  accent: string;
  canvas: string;
};

export function chromeTokens(theme: "light" | "dark"): ChromeTokens {
  if (theme === "dark") {
    return {
      bg: `var(--background, ${ATMOS_DARK_CANVAS})`,
      fg: "var(--foreground, #fafafa)",
      card: `var(--card, ${ATMOS_DARK_CARD})`,
      border: "var(--border, rgba(255,255,255,0.10))",
      muted: "var(--muted, #3f3f46)",
      mutedFg: "var(--muted-foreground, #a1a1aa)",
      accent: "var(--accent, #3f3f46)",
      canvas: ATMOS_DARK_CANVAS,
    };
  }
  return {
    bg: `var(--background, ${ATMOS_LIGHT_CANVAS})`,
    fg: "var(--foreground, #18181b)",
    card: "var(--card, #ffffff)",
    border: "var(--border, rgba(0,0,0,0.10))",
    muted: "var(--muted, #f4f4f5)",
    mutedFg: "var(--muted-foreground, #71717a)",
    accent: "var(--accent, #f4f4f5)",
    canvas: ATMOS_LIGHT_CANVAS,
  };
}

export function resolveBoardTheme(theme: "light" | "dark" | "system" | undefined): "light" | "dark" {
  if (theme === "dark" || theme === "light") return theme;
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}
