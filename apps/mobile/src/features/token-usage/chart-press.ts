export const CHART_HOLD_MS = 260;

export type ChartTipOpen = "hold" | "tap";

export const GROWTH_CHART_TIP = "hold" as const satisfies ChartTipOpen;
export const STACKED_CHART_TIP = "tap" as const satisfies ChartTipOpen;

export function chartTipPersistsOnRelease(open: ChartTipOpen) {
  return open === "tap";
}

export function chartOpensOnTap(open: ChartTipOpen) {
  return open === "tap";
}
