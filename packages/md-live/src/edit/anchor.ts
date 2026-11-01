import type { MdLiveViewportRect } from "./types";

/** Anchor a popover to the bottom-right of a selection rect (no jumps; CSS can ease). */
export function mdLivePopoverAnchorStyle(
  rect: MdLiveViewportRect,
  popoverWidth: number,
  gap = 8,
  viewportWidth = 1280,
): { top: number; left: number } {
  const width = Math.max(0, popoverWidth);
  const maxLeft = Math.max(8, viewportWidth - width - 8);
  const left = Math.min(Math.max(8, rect.right - width), maxLeft);
  return { top: rect.bottom + gap, left };
}
