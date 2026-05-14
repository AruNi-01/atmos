"use client";

import { DEFAULT_THEME, structuredClone, type TLTheme, type TLThemes } from "tldraw";

type ThemeMode = keyof TLTheme["colors"];
type ThemeColors = TLTheme["colors"]["light"];

const FALLBACK_THEME_COLORS: Record<ThemeMode, Pick<
  ThemeColors,
  | "background"
  | "negativeSpace"
  | "solid"
  | "text"
  | "cursor"
  | "noteBorder"
  | "snap"
  | "selectionStroke"
  | "selectionFill"
  | "brushFill"
  | "brushStroke"
>> = {
  light: {
    background: "#ffffff",
    negativeSpace: "#ffffff",
    solid: "#ffffff",
    text: "#24292f",
    cursor: "#24292f",
    noteBorder: "#d0d7de",
    snap: "#0969da",
    selectionStroke: "hsl(214, 84%, 56%)",
    selectionFill: "rgba(9, 105, 218, 0.2)",
    brushFill: "rgba(9, 105, 218, 0.12)",
    brushStroke: "rgba(9, 105, 218, 0.35)",
  },
  dark: {
    background: "#09090b",
    negativeSpace: "#09090b",
    solid: "hsl(240, 6%, 12%)",
    text: "#f8f8f8",
    cursor: "#f8f8f8",
    noteBorder: "hsl(240, 9%, 22%)",
    snap: "#58a6ff",
    selectionStroke: "hsl(214, 84%, 56%)",
    selectionFill: "rgba(88, 166, 255, 0.2)",
    brushFill: "rgba(88, 166, 255, 0.12)",
    brushStroke: "rgba(88, 166, 255, 0.4)",
  },
};

function readSemanticToken(
  styles: CSSStyleDeclaration,
  tokenName: string,
  fallback: string,
) {
  const value = styles.getPropertyValue(tokenName).trim();
  return value || fallback;
}

function withAlpha(
  styles: CSSStyleDeclaration,
  tokenName: string,
  percentage: number,
  fallback: string,
) {
  const baseColor = readSemanticToken(styles, tokenName, fallback);
  return `color-mix(in srgb, ${baseColor} ${percentage}%, transparent)`;
}

function applySemanticThemeColors(
  theme: TLTheme,
  mode: ThemeMode,
  styles: CSSStyleDeclaration,
) {
  const fallback = FALLBACK_THEME_COLORS[mode];
  const colors = theme.colors[mode];
  const background = readSemanticToken(styles, "--background", fallback.background);
  const foreground = readSemanticToken(styles, "--foreground", fallback.text);
  const card = readSemanticToken(styles, "--card", fallback.solid);
  const border = readSemanticToken(styles, "--border", fallback.noteBorder);
  const selection = readSemanticToken(styles, "--ring", fallback.selectionStroke);

  colors.background = background;
  colors.negativeSpace = background;
  colors.solid = card;
  colors.text = foreground;
  colors.cursor = foreground;
  colors.noteBorder = border;
  colors.snap = selection;
  colors.selectionStroke = selection;
  colors.selectionFill = withAlpha(styles, "--ring", 20, fallback.selectionFill);
  colors.brushFill = withAlpha(styles, "--ring", 12, fallback.brushFill);
  colors.brushStroke = withAlpha(styles, "--ring", 35, fallback.brushStroke);
}

function applyFallbackThemeColors(theme: TLTheme, mode: ThemeMode) {
  Object.assign(theme.colors[mode], FALLBACK_THEME_COLORS[mode]);
}

export function createAtmosTldrawTheme(): TLTheme {
  const theme = structuredClone(DEFAULT_THEME);

  theme.id = "default";

  if (typeof document === "undefined" || !document.body) {
    applyFallbackThemeColors(theme, "light");
    applyFallbackThemeColors(theme, "dark");
    return theme;
  }

  const lightProbe = document.createElement("div");
  const darkProbe = document.createElement("div");

  for (const probe of [lightProbe, darkProbe]) {
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.inset = "-9999px";
    document.body.appendChild(probe);
  }
  darkProbe.classList.add("dark");

  try {
    applySemanticThemeColors(theme, "light", getComputedStyle(lightProbe));
    applySemanticThemeColors(theme, "dark", getComputedStyle(darkProbe));
  } finally {
    lightProbe.remove();
    darkProbe.remove();
  }

  return theme;
}

export function createAtmosTldrawThemes(): Partial<TLThemes> {
  return {
    default: createAtmosTldrawTheme(),
  };
}
