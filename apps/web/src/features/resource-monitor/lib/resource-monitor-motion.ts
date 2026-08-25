export const RESOURCE_MONITOR_BAR_DURATION_MS = 600;
export const RESOURCE_MONITOR_BAR_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
export const RESOURCE_MONITOR_CHART_DURATION_MS = 450;
export const RESOURCE_MONITOR_CHART_EASING = "ease-out";

/** Recharts Line animation. `reduce` from motion/react; null falls back to matchMedia. */
export function resourceMonitorChartAnimationActive(
  reduce?: boolean | null,
): boolean {
  if (reduce === true) return false;
  if (reduce === false) return true;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
