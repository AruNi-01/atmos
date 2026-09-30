export type CenterSpaceBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const CENTER_SPACE_OVERVIEW_MS = 520;
export const CENTER_SPACE_OVERVIEW_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Uniform scale that fits `stage` inside `slot`, centered.
 * Translate is in the stage's pre-scale pixel space (transform-origin 0 0).
 */
export function centerSpaceOverviewTransform(
  stage: CenterSpaceBox,
  slot: CenterSpaceBox,
): { x: number; y: number; scale: number } {
  const safeW = Math.max(stage.width, 1);
  const safeH = Math.max(stage.height, 1);
  const scale = Math.min(slot.width / safeW, slot.height / safeH);
  const scaledW = safeW * scale;
  const scaledH = safeH * scale;
  return {
    scale,
    x: slot.left + (slot.width - scaledW) / 2 - stage.left,
    y: slot.top + (slot.height - scaledH) / 2 - stage.top,
  };
}

/** Keep preview cards near a window shape when the center is very wide or tall. */
export function clampCenterSpacePreviewAspect(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1.6;
  return Math.min(1.9, Math.max(1.25, width / height));
}
