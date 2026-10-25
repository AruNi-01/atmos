import { overlayPlotHeight } from "./chart-geometry";

/** Vertical scrub line for the stacked bar popover. Light charts need a dark stroke. */
export function columnIndicatorColor(isDark: boolean): string {
  return isDark ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.45)";
}

/** Host x of the bar centre. `x` is the bar's left edge in plot-content coordinates. */
export function columnIndicatorHostX(input: {
  axisWidth?: number;
  offset: number;
  width: number;
  x: number;
}) {
  return (input.axisWidth ?? 0) + input.x + input.width / 2 - input.offset;
}

/** Same dash as the growth area crosshair. */
export const COLUMN_INDICATOR_DASH: readonly [number, number] = [3, 4];
export const COLUMN_INDICATOR_STROKE_WIDTH = 1;

/**
 * Scrub line for one column. y1 is the top of the plot. y2 is the x-axis
 * (`overlayPlotHeight`), above the date-label band.
 */
export function columnIndicatorLine(input: { chartHeight: number; x: number }) {
  return {
    strokeDasharray: COLUMN_INDICATOR_DASH,
    strokeWidth: COLUMN_INDICATOR_STROKE_WIDTH,
    x1: input.x,
    x2: input.x,
    y1: 0,
    y2: overlayPlotHeight(input.chartHeight),
  };
}
