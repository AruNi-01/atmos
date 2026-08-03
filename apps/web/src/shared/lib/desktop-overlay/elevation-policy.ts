/**
 * Pure elevation / suspend policy for APP-052 Desktop Overlay Surface.
 * No DOM, no Electron — unit-tested entry points for product wiring.
 */

export type OverlayLayerKind =
  | "dialog"
  | "sheet"
  | "drawer"
  | "popover"
  | "menu"
  | "select"
  | "tooltip"
  | "hover-card"
  | "custom";

export type OverlayPointerMode = "pass-through" | "capture";

export type ElevateContext = {
  /** Desktop shell reports overlay capability (Electron + feature on). */
  capability: boolean;
  /** At least one desktop-native preview surface is attached/visible on this host. */
  nativePreviewPresent: boolean;
  /** Floating UI is modal / blocking (dialog, sheet, drawer with aria-modal). */
  modal: boolean;
  /** Geometry: floating UI intersects a native preview surface rect. */
  intersectsPreview: boolean;
};

/**
 * Whether a floating UI role should elevate into the shared overlay surface.
 * Web / no capability / no native preview → never elevate.
 */
export function shouldElevate(
  kind: OverlayLayerKind,
  ctx: ElevateContext,
): boolean {
  if (!ctx.capability || !ctx.nativePreviewPresent) return false;

  // Modal classes always elevate when native preview is present (live dimmer).
  if (ctx.modal) return true;
  if (
    kind === "dialog" ||
    kind === "sheet" ||
    kind === "drawer"
  ) {
    return true;
  }

  // Lightweight floaters (incl. tooltips): elevate when they intersect preview.
  return ctx.intersectsPreview;
}

/**
 * APP-029 suspend rule once elevation exists:
 * hide native preview only when occluded AND elevation does not cover.
 */
export function shouldSuspendFromOcclusion(args: {
  isOccluded: boolean;
  elevationCovers: boolean;
}): boolean {
  return args.isOccluded && !args.elevationCovers;
}

/**
 * elevationCovers: healthy overlay path is handling open floating layers.
 */
export function computeElevationCovers(args: {
  capability: boolean;
  surfaceReady: boolean;
  ensureFailed: boolean;
  elevatedLayerCount: number;
}): boolean {
  if (!args.capability) return false;
  if (args.ensureFailed) return false;
  if (!args.surfaceReady) return false;
  return args.elevatedLayerCount > 0;
}

/** Modal layers force capture; otherwise pass-through (tight bounds). */
export function pointerModeForLayers(
  layers: ReadonlyArray<{ modal: boolean }>,
): OverlayPointerMode {
  if (layers.some((l) => l.modal)) return "capture";
  return "pass-through";
}

/** Expand a client rect by padding (tight overlay bounds). */
export function expandRect(
  rect: { x: number; y: number; width: number; height: number },
  padding: number,
): { x: number; y: number; width: number; height: number } {
  const p = Math.max(0, padding);
  return {
    x: rect.x - p,
    y: rect.y - p,
    width: rect.width + p * 2,
    height: rect.height + p * 2,
  };
}

export function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Whether cold create exceeded budget while still not ready. */
export function shouldFallbackHideDuringEnsure(args: {
  ensureStartedAt: number | null;
  now: number;
  ready: boolean;
  createBudgetMs: number;
  isOccluded: boolean;
}): boolean {
  if (!args.isOccluded) return false;
  if (args.ready) return false;
  if (args.ensureStartedAt == null) return args.isOccluded;
  return args.now - args.ensureStartedAt >= args.createBudgetMs;
}

/**
 * Compose desktop-native preview suspend reasons (APP-052 AC2 / M3).
 * - Unconditional: standalone handoff open, loading.
 * - Occlusion: APP-029 geometry when elevation does not cover.
 * - Elevatable chrome (favorites / header / search popovers): only when
 *   elevation does **not** cover — happy-path elevation must keep preview live.
 */
export function shouldSuspendDesktopNativePreview(args: {
  isDesktopNative: boolean;
  isStandaloneHandoffOpen: boolean;
  isPreviewLoading: boolean;
  suspendFromOcclusion: boolean;
  elevationCovers: boolean;
  elevatableChromeOpen: boolean;
}): boolean {
  if (!args.isDesktopNative) return false;
  if (args.isStandaloneHandoffOpen) return true;
  if (args.isPreviewLoading) return true;
  if (args.suspendFromOcclusion) return true;
  // favorites / header / global search are elevatable floaters — do not hide
  // preview when the shared overlay covers them.
  if (args.elevatableChromeOpen && !args.elevationCovers) return true;
  return false;
}
