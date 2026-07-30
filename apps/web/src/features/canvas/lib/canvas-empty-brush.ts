import type { Editor, TLShapeId } from "tldraw";

/** Page-space rectangle from a finished select-tool brush. */
export type CanvasPageRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * Minimum brush size in page units before we treat an empty marquee as an
 * intentional "add widget here" gesture (avoids tiny accidental drags).
 */
export const EMPTY_BRUSH_MIN_PAGE_SIZE = 64;

export function normalizeCanvasPageRect(
  brush: { x: number; y: number; w: number; h: number } | null | undefined,
): CanvasPageRect | null {
  if (!brush) {
    return null;
  }
  const w = Math.abs(brush.w);
  const h = Math.abs(brush.h);
  if (!Number.isFinite(brush.x) || !Number.isFinite(brush.y) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null;
  }
  return {
    x: brush.w < 0 ? brush.x + brush.w : brush.x,
    y: brush.h < 0 ? brush.y + brush.h : brush.y,
    w,
    h,
  };
}

export function isEmptyBrushRegionEligible(brush: CanvasPageRect | null | undefined): boolean {
  if (!brush) {
    return false;
  }
  return brush.w >= EMPTY_BRUSH_MIN_PAGE_SIZE && brush.h >= EMPTY_BRUSH_MIN_PAGE_SIZE;
}

/**
 * After a select-tool brush ends: open the compact add-widget popover only when
 * nothing was selected (empty area) and the marquee was large enough.
 */
export function shouldOpenEmptyBrushAddWidget(options: {
  selectedShapeIds: readonly string[];
  brush: CanvasPageRect | null;
  wasBrushing: boolean;
  cancelled?: boolean;
}): boolean {
  if (!options.wasBrushing || options.cancelled) {
    return false;
  }
  if (options.selectedShapeIds.length > 0) {
    return false;
  }
  return isEmptyBrushRegionEligible(options.brush);
}

/**
 * Prefer the smallest frame that fully contains the marquee so widgets land
 * inside the frame the user was drawing over.
 */
export function findFrameContainingPageRect(
  editor: Editor,
  rect: CanvasPageRect,
): TLShapeId | null {
  let bestId: TLShapeId | null = null;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== "frame") {
      continue;
    }
    const bounds = editor.getShapePageBounds(shape);
    if (!bounds) {
      continue;
    }
    const contains =
      bounds.minX <= rect.x &&
      bounds.minY <= rect.y &&
      bounds.maxX >= rect.x + rect.w &&
      bounds.maxY >= rect.y + rect.h;
    if (!contains) {
      continue;
    }
    const area = bounds.w * bounds.h;
    if (area < bestArea) {
      bestArea = area;
      bestId = shape.id;
    }
  }

  return bestId;
}
