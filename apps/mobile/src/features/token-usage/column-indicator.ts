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

export function columnIndicatorLine(input: { height: number; x: number }) {
  return { x1: input.x, x2: input.x, y1: 0, y2: input.height };
}
