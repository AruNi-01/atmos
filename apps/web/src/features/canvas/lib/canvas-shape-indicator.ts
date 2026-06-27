"use client";

export const CANVAS_CARD_CORNER_RADIUS = 20;
const CANVAS_CARD_BORDER_WIDTH = 1;

export function getCanvasCardInnerCornerRadius(scale = 1) {
  const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.max(0, CANVAS_CARD_CORNER_RADIUS - CANVAS_CARD_BORDER_WIDTH) * normalizedScale;
}

export function createCanvasCardIndicatorPath(
  width: number,
  height: number,
  radius = CANVAS_CARD_CORNER_RADIUS,
) {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const path = new Path2D();

  if (w === 0 || h === 0) {
    return path;
  }

  if (r === 0) {
    path.rect(0, 0, w, h);
    return path;
  }

  path.moveTo(r, 0);
  path.lineTo(w - r, 0);
  path.quadraticCurveTo(w, 0, w, r);
  path.lineTo(w, h - r);
  path.quadraticCurveTo(w, h, w - r, h);
  path.lineTo(r, h);
  path.quadraticCurveTo(0, h, 0, h - r);
  path.lineTo(0, r);
  path.quadraticCurveTo(0, 0, r, 0);
  path.closePath();

  return path;
}
