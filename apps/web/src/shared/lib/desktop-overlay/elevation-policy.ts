/**
 * Pure elevation / suspend policy for APP-052 Desktop Overlay Surface.
 * No DOM, no Electron — unit-tested entry points for product wiring.
 */

export type OverlayPointerMode = "pass-through" | "capture";

/**
 * elevationHealthy: the shared overlay surface is ready to host floating UI.
 * While healthy, `@workspace/ui` portals deterministically mount into the
 * overlay document, so elevatable chrome never needs the APP-029 hide.
 */
export function computeElevationHealthy(args: {
  capability: boolean;
  surfaceReady: boolean;
  ensureFailed: boolean;
}): boolean {
  return args.capability && args.surfaceReady && !args.ensureFailed;
}

/**
 * Compose desktop-native preview suspend reasons (APP-052 AC2 / M3).
 * - Unconditional: standalone handoff open, loading.
 * - Host occlusion: APP-029 geometry against **host-document** floaters.
 *   Elevated layers live in the overlay document and never appear as host
 *   occlusion candidates, so anything the geometry check still sees is by
 *   definition not covered by elevation → always hide.
 * - Elevatable chrome (favorites / header / search popovers): those portals
 *   mount into the overlay while elevation is healthy, so suspend only when
 *   elevation is **not** healthy (APP-029 fallback).
 */
export function shouldSuspendDesktopNativePreview(args: {
  isDesktopNative: boolean;
  isStandaloneHandoffOpen: boolean;
  isPreviewLoading: boolean;
  hostOcclusion: boolean;
  elevatableChromeOpen: boolean;
  elevationHealthy: boolean;
}): boolean {
  if (!args.isDesktopNative) return false;
  if (args.isStandaloneHandoffOpen) return true;
  if (args.isPreviewLoading) return true;
  if (args.hostOcclusion) return true;
  if (args.elevatableChromeOpen && !args.elevationHealthy) return true;
  return false;
}
