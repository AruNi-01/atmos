/**
 * Positive-domain helpers for dither line charts.
 * Generic scale only — no resource thresholds or business tone.
 */

/** Auto-domain headroom used by DitherRevenueLines when `yMax` is unset. */
export const REVENUE_LINES_AUTO_HEADROOM = 1.2;

/** True when `yMax` is a usable fixed positive domain. */
export function isFixedDomainMax(yMax: number | undefined): yMax is number {
  return typeof yMax === "number" && Number.isFinite(yMax) && yMax > 0;
}

/**
 * Prefer a valid fixed `yMax`; otherwise keep the caller-computed auto max.
 * Growth uses this so its 1.06 axis lerp stays unchanged when `yMax` is omitted.
 */
export function resolveFixedDomainMax(
  yMax: number | undefined,
  autoMax: number,
): number {
  return isFixedDomainMax(yMax) ? yMax : autoMax;
}

/**
 * Resolve the drawing domain max.
 * Valid `yMax` → that value (no headroom).
 * `undefined` / invalid → `max(1, dataPeak) * 1.2` (legacy auto domain).
 */
export function resolveDomainMax(
  yMax: number | undefined,
  dataPeak: number,
): number {
  return resolveFixedDomainMax(
    yMax,
    Math.max(1, dataPeak) * REVENUE_LINES_AUTO_HEADROOM,
  );
}

/**
 * Clamp a plotted value onto a fixed domain.
 * Auto / invalid `yMax` leaves the value unchanged.
 */
export function clampToDomain(
  value: number,
  yMax: number | undefined,
): number {
  if (!isFixedDomainMax(yMax)) return value;
  return Math.max(0, Math.min(yMax, value));
}
