/** Keep the source pane's shape, just shrink it to a mid-size card. */
const PREVIEW_SCALE = 0.42;
const PREVIEW_MAX_WIDTH = 420;
const PREVIEW_MAX_HEIGHT = 280;
const PREVIEW_MIN_WIDTH = 200;

export function scaleTerminalDragPreview(
  width = 0,
  height = 0,
): { width: number; height: number; scale: number } {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  let scale = Math.min(PREVIEW_SCALE, PREVIEW_MAX_WIDTH / safeW, PREVIEW_MAX_HEIGHT / safeH);
  if (safeW * scale < PREVIEW_MIN_WIDTH) {
    const bumped = Math.min(PREVIEW_MIN_WIDTH / safeW, 0.72);
    if (safeW * bumped <= PREVIEW_MAX_WIDTH && safeH * bumped <= PREVIEW_MAX_HEIGHT) {
      scale = bumped;
    }
  }
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
    scale,
  };
}

/** Pointer sits on the top-center so the card hangs below the cursor. */
export function dragPreviewGrabOffset(width: number): { x: number; y: number } {
  return { x: Math.round(Math.max(1, width) / 2), y: 0 };
}
