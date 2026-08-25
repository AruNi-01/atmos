import type { DitherTheme } from "@workspace/ui";

export type ResourceMonitorPressureTone = "low" | "medium" | "high";
export type ResourceMonitorMeterTone = "pressure" | "neutral";

/** DESIGN success / warning / destructive + muted-foreground, as Dither hex. */
const PRESSURE_HEX = {
  light: {
    low: "#0AA543",
    medium: "#D99600",
    high: "#E7000B",
    neutral: "#71717B",
  },
  dark: {
    low: "#5FCC74",
    medium: "#EEB245",
    high: "#FF6467",
    neutral: "#9F9FA9",
  },
} as const;

export function resourceMonitorPressureTone(
  percent: number,
): ResourceMonitorPressureTone {
  if (percent < 60) return "low";
  if (percent < 80) return "medium";
  return "high";
}

export function resourceMonitorDitherTheme(
  resolvedTheme: string | undefined,
): DitherTheme {
  return resolvedTheme === "light" ? "light" : "dark";
}

export function resourceMonitorDitherColor(
  theme: DitherTheme,
  meter: ResourceMonitorMeterTone,
  percent: number,
): string {
  if (meter === "neutral") return PRESSURE_HEX[theme].neutral;
  return PRESSURE_HEX[theme][resourceMonitorPressureTone(percent)];
}
