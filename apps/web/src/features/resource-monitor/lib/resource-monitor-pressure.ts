import type { DitherGrowthColorStop, DitherTheme } from "@workspace/ui";

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

/** Full-length Funnel track — lighter than the moderate neutral foreground. */
const TRACK_HEX = {
  light: "#C3C3C9",
  dark: "#47474C",
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

export function resourceMonitorDitherTrackColor(theme: DitherTheme): string {
  return TRACK_HEX[theme];
}

function mixHex(from: string, to: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount));
  const parse = (hex: string): [number, number, number] | null => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
  };
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return from;
  const channel = (index: number) =>
    Math.round(a[index]! + (b[index]! - a[index]!) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/**
 * Vertical fill ramp for Host trend charts (btop-style):
 * green → light green → light yellow → yellow → light red → red.
 * Adjacent stops stay different so Growth interpolates instead of banding.
 */
export function resourceMonitorGrowthColorStops(
  theme: DitherTheme,
  yMax = 100,
): DitherGrowthColorStop[] {
  const colors = PRESSURE_HEX[theme];
  const cap = Number.isFinite(yMax) && yMax > 0 ? yMax : 100;
  const scale = cap / 100;
  return [
    { value: 0 * scale, color: colors.low },
    { value: 18 * scale, color: mixHex(colors.low, colors.medium, 0.22) },
    { value: 38 * scale, color: mixHex(colors.low, colors.medium, 0.55) },
    { value: 55 * scale, color: colors.medium },
    { value: 78 * scale, color: mixHex(colors.medium, colors.high, 0.42) },
    { value: 100 * scale, color: colors.high },
  ];
}

export function resourceMonitorPressureTextClass(
  tone: ResourceMonitorPressureTone,
): string {
  if (tone === "medium") return "text-warning";
  if (tone === "high") return "text-destructive";
  return "text-success";
}
