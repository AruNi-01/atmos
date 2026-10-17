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

/** Web context trigger ring: `size-3.5`, radius 6, stroke 1.5, track at muted 35%. */
export const CONTEXT_RING_SIZE = 14;
export const CONTEXT_RING_RADIUS = 6;
export const CONTEXT_RING_STROKE = 1.5;

export function contextRingDash(percent: number): { circumference: number; offset: number } {
  const circumference = 2 * Math.PI * CONTEXT_RING_RADIUS;
  const clamped = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
  return {
    circumference,
    offset: circumference * (1 - clamped / 100),
  };
}

export function contextRingTrack(isDark: boolean): string {
  return isDark ? "rgba(159, 159, 169, 0.35)" : "rgba(113, 113, 123, 0.35)";
}
