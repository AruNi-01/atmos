/** Vertical scrub line for the stacked bar popover. Light charts need a dark stroke. */
export function columnIndicatorColor(isDark: boolean): string {
  return isDark ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.45)";
}

export function columnIndicatorLine(input: { height: number; x: number }) {
  return { x1: input.x, x2: input.x, y1: 0, y2: input.height };
}
