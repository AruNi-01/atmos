export const lightColors = {
  background: "#f7f7f7",
  card: "rgba(255, 255, 255, 0.58)",
  cardElevated: "#ffffff",
  cardSubtle: "rgba(255, 255, 255, 0.36)",
  glassBorder: "rgba(10, 10, 11, 0.11)",
  glassFallback: "rgba(255, 255, 255, 0.62)",
  glassFallbackStrong: "rgba(255, 255, 255, 0.82)",
  glassTint: "rgba(255, 255, 255, 0.32)",
  separator: "rgba(10, 10, 11, 0.08)",
  separatorStrong: "rgba(10, 10, 11, 0.16)",
  label: "#0a0a0b",
  labelInverse: "#fafafa",
  secondaryLabel: "#3f3f46",
  tertiaryLabel: "#8b8b92",
  primary: "#0a0a0b",
  primaryPressed: "#202022",
  mutedPressed: "rgba(24, 24, 27, 0.08)",
  selection: "rgba(10, 10, 11, 0.18)",
  green: "#16a34a",
  greenSurface: "rgba(22, 163, 74, 0.10)",
  greenBorder: "rgba(22, 163, 74, 0.22)",
  red: "#dc2626",
  redSurface: "rgba(220, 38, 38, 0.10)",
  redBorder: "rgba(220, 38, 38, 0.22)",
  yellow: "#a16207",
  yellowSurface: "rgba(161, 98, 7, 0.10)",
  yellowBorder: "rgba(161, 98, 7, 0.22)",
  terminalBg: "#f8fafc",
  terminalFg: "#111827",
  terminalMuted: "#64748b",
};

export const darkColors: MobileThemeColors = {
  background: "#0b0f14",
  card: "rgba(24, 24, 27, 0.72)",
  cardElevated: "#18181b",
  cardSubtle: "rgba(39, 39, 42, 0.58)",
  glassBorder: "rgba(255, 255, 255, 0.12)",
  glassFallback: "rgba(24, 24, 27, 0.72)",
  glassFallbackStrong: "rgba(39, 39, 42, 0.86)",
  glassTint: "rgba(24, 24, 27, 0.42)",
  separator: "rgba(255, 255, 255, 0.10)",
  separatorStrong: "rgba(255, 255, 255, 0.18)",
  label: "#f8fafc",
  labelInverse: "#0a0a0b",
  secondaryLabel: "#cbd5e1",
  tertiaryLabel: "#94a3b8",
  primary: "#f8fafc",
  primaryPressed: "#e4e4e7",
  mutedPressed: "rgba(255, 255, 255, 0.10)",
  selection: "rgba(248, 250, 252, 0.22)",
  green: "#4ade80",
  greenSurface: "rgba(74, 222, 128, 0.14)",
  greenBorder: "rgba(74, 222, 128, 0.26)",
  red: "#f87171",
  redSurface: "rgba(248, 113, 113, 0.14)",
  redBorder: "rgba(248, 113, 113, 0.28)",
  yellow: "#facc15",
  yellowSurface: "rgba(250, 204, 21, 0.14)",
  yellowBorder: "rgba(250, 204, 21, 0.28)",
  terminalBg: "#0b0f14",
  terminalFg: "#d8dee9",
  terminalMuted: "#a1a1aa",
};

export type MobileThemeColorScheme = "light" | "dark";
export type MobileThemeColors = typeof lightColors;

export const colors = lightColors;

export function getMobileThemeColors(colorScheme: MobileThemeColorScheme) {
  return colorScheme === "dark" ? darkColors : lightColors;
}

export const radii = {
  card: 8,
  control: 8,
};
