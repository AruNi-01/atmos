import { resolveFixedDomainMax } from "./domain";
import type { DitherTheme } from "./math";

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
