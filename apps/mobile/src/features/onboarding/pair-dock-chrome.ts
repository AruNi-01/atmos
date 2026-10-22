import type { CameraScannerModel } from "@/features/onboarding/camera-permission-state";

export type PairScannerCameraKind = CameraScannerModel["kind"] | null;

/** A live camera feed is the only scanner state that keeps the dark pair dock. */
export function cameraPreviewIsLive(kind: PairScannerCameraKind): boolean {
  return kind === "preview";
}

/**
 * Light theme uses the glass dock while the scanner is open and the camera is
 * not previewing. Dark theme, the closed sign-in dock, and a live preview keep
 * the existing inverted dock.
 */
export function pairScannerDockUsesThemeGlass(input: {
  cameraKind: PairScannerCameraKind;
  isDark: boolean;
  scannerOpen: boolean;
}): boolean {
  if (input.isDark || !input.scannerOpen) return false;
  return !cameraPreviewIsLive(input.cameraKind);
}
