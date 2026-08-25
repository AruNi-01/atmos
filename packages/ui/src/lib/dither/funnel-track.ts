/**
 * Full-width funnel track helpers. Generic paint only — no resource tones.
 */

export const FUNNEL_TRACK_ALPHA = 0.28;
export const FUNNEL_FOREGROUND_ALPHA = 0.85;

/** Non-empty color string enables the full-width dither track. */
export function resolveFunnelTrack(
  trackColor: string | undefined,
): { color: string; alpha: number } | null {
  if (typeof trackColor !== "string" || trackColor.length === 0) return null;
  return { color: trackColor, alpha: FUNNEL_TRACK_ALPHA };
}

/** Foreground width from the (possibly morphing) stage value. Track is always full canvas. */
export function funnelValueWidth(
  canvasW: number,
  value: number,
  scaleMax: number,
): number {
  if (!(canvasW > 0) || !(scaleMax > 0)) return 0;
  return Math.max(0, Math.min(canvasW, (value / scaleMax) * canvasW));
}
