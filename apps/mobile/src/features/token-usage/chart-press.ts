export const CHART_HOLD_MS = 260;

export type ChartTipOpen = "hold" | "tap";

export const GROWTH_CHART_TIP = "hold" as const satisfies ChartTipOpen;
export const STACKED_CHART_TIP = "hold" as const satisfies ChartTipOpen;

export function chartTipPersistsOnRelease(open: ChartTipOpen) {
  return open === "tap";
}

export function chartOpensOnTap(open: ChartTipOpen) {
  return open === "tap";
}

/**
 * Identity for clearing a persisted tip (and zoom) when Computer / All or
 * the series values change. Independent of persist-on-release: two Computers
 * with the same bar count, first/last labels, and peak still differ here.
 */
export function chartTipResetSignature(input: {
  labels: readonly string[];
  resetKey?: string | null;
  values: readonly number[];
}) {
  const count = input.labels.length;
  return [
    input.resetKey ?? "",
    count,
    input.labels[0] ?? "",
    input.labels[count - 1] ?? "",
    input.values.join(","),
  ].join(":");
}
