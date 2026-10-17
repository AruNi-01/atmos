/**
 * Web `formatCompactTokenCount` and `contextWindowBarTone`.
 * The bar track is `--muted` (`#dedee0` / `#27272a`).
 * The warning fill is `--warning`: light `oklch(0.72 0.16 79)`, dark `oklch(0.8 0.14 79)`.
 */

export function formatCompactTokenCount(count: number): string {
  const n = Math.max(0, Math.round(count));
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (n >= 1000) {
    const thousands = n / 1000;
    if (thousands >= 100) return `${Math.round(thousands)}k`;
    return Number.isInteger(thousands) ? `${thousands}k` : `${thousands.toFixed(1)}k`;
  }
  return String(n);
}

export type ContextWindowBarTone = "default" | "warning";

export function contextWindowBarTone(percent: number): ContextWindowBarTone {
  return percent >= 70 ? "warning" : "default";
}

export const CONTEXT_BAR_TRACK_LIGHT = "#dedee0";
export const CONTEXT_BAR_TRACK_DARK = "#27272a";
export const CONTEXT_BAR_WARNING_LIGHT = "#d99600";
export const CONTEXT_BAR_WARNING_DARK = "#eeb245";

export function contextBarTrack(isDark: boolean): string {
  return isDark ? CONTEXT_BAR_TRACK_DARK : CONTEXT_BAR_TRACK_LIGHT;
}

export function contextBarWarning(isDark: boolean): string {
  return isDark ? CONTEXT_BAR_WARNING_DARK : CONTEXT_BAR_WARNING_LIGHT;
}
