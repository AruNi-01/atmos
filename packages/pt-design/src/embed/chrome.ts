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
      bg: "var(--background, #242428)",
      fg: "var(--foreground, #fafafa)",
      card: "var(--card, #2e2e33)",
      border: "var(--border, rgba(255,255,255,0.12))",
      muted: "var(--muted, #3a3a40)",
      mutedFg: "var(--muted-foreground, #a1a1aa)",
      accent: "var(--accent, #3a3a40)",
      canvas: "#242428",
    };
  }
  return {
    bg: "var(--background, #fafafa)",
    fg: "var(--foreground, #18181b)",
    card: "var(--card, #ffffff)",
    border: "var(--border, rgba(0,0,0,0.10))",
    muted: "var(--muted, #f4f4f5)",
    mutedFg: "var(--muted-foreground, #71717a)",
    accent: "var(--accent, #f4f4f5)",
    canvas: "#ffffff",
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
