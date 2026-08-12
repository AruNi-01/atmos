/** Terminal surface is always Web-dark (#09090b) regardless of app color scheme. */
export const terminalSurfaceColors = {
  terminalBg: "#09090b",
  terminalFg: "#f8f8f8",
  terminalMuted: "#a1a1aa",
  terminalScrollbar: "rgba(161, 161, 170, 0.34)",
  terminalStatusError: "#fca5a5",
  terminalKeycap: "rgba(248, 250, 252, 0.10)",
  terminalKeycapPressed: "rgba(248, 250, 252, 0.16)",
  terminalChromeFallback: "rgba(9, 9, 11, 0.92)",
  terminalChromeTint: "rgba(9, 9, 11, 0.78)",
};

/** Workflow status icon colors — shared across light and dark app chrome. */
export const workflowStatusColors = {
  workflowStatusInProgress: "#3b82f6",
  workflowStatusInReview: "#10b981",
  workflowStatusBlocked: "#f59e0b",
  workflowStatusCompleted: "#6366f1",
} as const;

export const lightColors = {
  background: "#f4f4f6",
  sheetBackground: "#f8f8f9",
  card: "#ffffff",
  cardElevated: "#ffffff",
  cardSubtle: "rgba(10, 10, 11, 0.05)",
  control: "#f8f8f9",
  controlBorder: "rgba(10, 10, 11, 0.10)",
  controlDisabled: "rgba(10, 10, 11, 0.045)",
  controlElevated: "#ffffff",
  controlGlassTint: "rgba(255, 255, 255, 0.24)",
  glassBorder: "rgba(10, 10, 11, 0.08)",
  glassFallback: "rgba(255, 255, 255, 0.82)",
  glassFallbackStrong: "rgba(255, 255, 255, 0.96)",
  glassTint: "rgba(255, 255, 255, 0.24)",
  separator: "rgba(10, 10, 11, 0.08)",
  separatorStrong: "rgba(10, 10, 11, 0.16)",
  label: "#111112",
  labelInverse: "#fafafa",
  ctaFill: "#111112",
  ctaLabel: "#fafafa",
  secondaryLabel: "#52525b",
  tertiaryLabel: "#9a9aa1",
  primary: "#111112",
  primaryPressed: "#242426",
  mutedPressed: "rgba(10, 10, 11, 0.06)",
  accent: "#0a84ff",
  selection: "rgba(10, 132, 255, 0.24)",
  green: "#16a34a",
  greenSurface: "rgba(22, 163, 74, 0.10)",
  greenBorder: "rgba(22, 163, 74, 0.22)",
  red: "#dc2626",
  redSurface: "rgba(220, 38, 38, 0.10)",
  redBorder: "rgba(220, 38, 38, 0.22)",
  yellow: "#a16207",
  yellowSurface: "rgba(161, 98, 7, 0.10)",
  yellowBorder: "rgba(161, 98, 7, 0.22)",
  segmentedTrack: "rgba(10, 10, 11, 0.055)",
  segmentedSelectedBorder: "rgba(10, 10, 11, 0.07)",
  ...workflowStatusColors,
  ...terminalSurfaceColors,
};

export const darkColors: MobileThemeColors = {
  background: "#000000",
  sheetBackground: "#1c1c1e",
  card: "#2c2c2e",
  cardElevated: "#2c2c2e",
  cardSubtle: "rgba(255, 255, 255, 0.08)",
  control: "#2c2c2e",
  controlBorder: "rgba(255, 255, 255, 0.12)",
  controlDisabled: "#343436",
  controlElevated: "#3a3a3c",
  controlGlassTint: "rgba(58, 58, 60, 0.38)",
  glassBorder: "rgba(255, 255, 255, 0.08)",
  glassFallback: "rgba(44, 44, 46, 0.94)",
  glassFallbackStrong: "rgba(58, 58, 60, 0.92)",
  glassTint: "rgba(58, 58, 60, 0.28)",
  separator: "rgba(255, 255, 255, 0.10)",
  separatorStrong: "rgba(255, 255, 255, 0.16)",
  label: "#f5f5f7",
  labelInverse: "#111112",
  ctaFill: "#111112",
  ctaLabel: "#f5f5f7",
  secondaryLabel: "#8e8e93",
  tertiaryLabel: "#69696f",
  primary: "#f5f5f7",
  primaryPressed: "#e5e5e7",
  mutedPressed: "rgba(255, 255, 255, 0.07)",
  accent: "#0a84ff",
  selection: "rgba(10, 132, 255, 0.28)",
  green: "#4ade80",
  greenSurface: "rgba(74, 222, 128, 0.14)",
  greenBorder: "rgba(74, 222, 128, 0.26)",
  red: "#f87171",
  redSurface: "rgba(248, 113, 113, 0.10)",
  redBorder: "rgba(248, 113, 113, 0.22)",
  yellow: "#facc15",
  yellowSurface: "rgba(250, 204, 21, 0.14)",
  yellowBorder: "rgba(250, 204, 21, 0.28)",
  segmentedTrack: "#1c1c1e",
  segmentedSelectedBorder: "rgba(255, 255, 255, 0.075)",
  ...workflowStatusColors,
  ...terminalSurfaceColors,
};

export type MobileThemeColorScheme = "light" | "dark";
export type MobileThemeColors = typeof lightColors;

export const colors = lightColors;

export function getMobileThemeColors(colorScheme: MobileThemeColorScheme) {
  return colorScheme === "dark" ? darkColors : lightColors;
}

export { radii } from "./radii";
