"use client";

import { DEFAULT_THEME, structuredClone, type TLTheme, type TLThemes } from "tldraw";

function createAtmosTldrawTheme(): TLTheme {
  const theme = structuredClone(DEFAULT_THEME);

  theme.id = "default";

  theme.colors.light.background = "#ffffff";
  theme.colors.light.negativeSpace = "#ffffff";
  theme.colors.light.text = "#24292f";
  theme.colors.light.cursor = "#24292f";
  theme.colors.light.noteBorder = "#d0d7de";
  theme.colors.light.snap = "#0969da";
  theme.colors.light.selectionStroke = "hsl(214, 84%, 56%)";
  theme.colors.light.selectionFill = "rgba(9, 105, 218, 0.2)";
  theme.colors.light.brushFill = "rgba(9, 105, 218, 0.12)";
  theme.colors.light.brushStroke = "rgba(9, 105, 218, 0.35)";

  theme.colors.dark.background = "#09090b";
  theme.colors.dark.negativeSpace = "#09090b";
  theme.colors.dark.text = "#f8f8f8";
  theme.colors.dark.cursor = "#f8f8f8";
  theme.colors.dark.noteBorder = "hsl(240, 9%, 22%)";
  theme.colors.dark.snap = "#58a6ff";
  theme.colors.dark.selectionStroke = "hsl(214, 84%, 56%)";
  theme.colors.dark.selectionFill = "rgba(88, 166, 255, 0.2)";
  theme.colors.dark.brushFill = "rgba(88, 166, 255, 0.12)";
  theme.colors.dark.brushStroke = "rgba(88, 166, 255, 0.4)";

  return theme;
}

export const ATMOS_TLDRAW_THEMES = {
  default: createAtmosTldrawTheme(),
} satisfies Partial<TLThemes>;
