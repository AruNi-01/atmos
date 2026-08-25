import { resolveFixedDomainMax } from "./domain";
import type { DitherTheme } from "./math";

export type GrowthColorStop = {
  value: number;
  color: string;
};

/** Auto-domain headroom used by DitherGrowth when `yMax` is unset. */
export const GROWTH_AUTO_HEADROOM = 1.06;

/**
 * Y-axis ceiling from the series peak — proportional headroom only.
 * ~6% above max so the crest doesn't kiss the top, without rounding
 * up to a "nice" number that can nearly double the scale.
 */
export function growthAxisMax(peak: number): number {
  if (peak <= 0) return 1;
  return peak * GROWTH_AUTO_HEADROOM;
}

/** Hex color (`#rgb` / `#rrggbb` / `#rrggbbaa`) replaces theme ink. */
export function resolveGrowthInk(
  color: string | undefined,
  theme: DitherTheme,
): string {
  if (
    typeof color === "string" &&
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)
  ) {
    return color;
  }
  return theme === "dark" ? "#FFFFFF" : "#0F172A";
}

function colorChannels(color: string): [number, number, number] | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

/**
 * Resolve a vertical Growth fill color. Repeated/nearby stops create flat
 * pressure bands with a short blended transition instead of recoloring the
 * whole series from its latest point.
 */
export function resolveGrowthColor(
  color: string | undefined,
  colorStops: readonly GrowthColorStop[] | undefined,
  value: number,
  theme: DitherTheme,
): string {
  const stops = (colorStops ?? [])
    .filter(
      (stop) =>
        Number.isFinite(stop.value) && colorChannels(stop.color) != null,
    )
    .slice()
    .sort((left, right) => left.value - right.value);
  if (stops.length === 0) return resolveGrowthInk(color, theme);
  const first = stops[0]!;
  if (value <= first.value) return first.color;
  const last = stops.at(-1)!;
  if (value >= last.value) return last.color;

  const upperIndex = stops.findIndex((stop) => value <= stop.value);
  const lower = stops[Math.max(0, upperIndex - 1)]!;
  const upper = stops[Math.max(0, upperIndex)]!;
  const lowerRgb = colorChannels(lower.color)!;
  const upperRgb = colorChannels(upper.color)!;
  const span = Math.max(Number.EPSILON, upper.value - lower.value);
  const progress = Math.max(0, Math.min(1, (value - lower.value) / span));
  const channels = lowerRgb.map((channel, index) =>
    Math.round(channel + (upperRgb[index]! - channel) * progress),
  );
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

export type GrowthPlotPadding = {
  padL: number;
  padR: number;
  padT: number;
  padB: number;
};

/** Compact (~40–50px area) uses ~2/0 padding and no axis chrome. */
export function resolveGrowthPlotPadding(
  compact: boolean,
  yLabelW: number,
): GrowthPlotPadding {
  if (compact) {
    return { padL: 2, padR: 2, padT: 2, padB: 0 };
  }
  return {
    padL: Math.min(64, Math.max(32, Math.ceil(yLabelW) + 10)),
    padR: 10,
    padT: 10,
    padB: 22,
  };
}

export function shouldPaintGrowthGuides(compact: boolean): boolean {
  return !compact;
}

/** Fixed `yMax` wins; otherwise keep Growth's existing auto / lerped axis. */
export function resolveGrowthAxisMax(
  yMax: number | undefined,
  autoAxis: number,
): number {
  return resolveFixedDomainMax(yMax, autoAxis);
}
