/**
 * Geometry helpers for the Accessibility/Screen Recording grant overlay.
 */

import { screen } from "electron";

export const PANEL_WIDTH = 460;
export const PANEL_HEIGHT = 128;

export type Rect = { x: number; y: number; width: number; height: number };

export function parseBoundsOutput(out: string): Rect | null {
  const nums = out.match(/-?\d+/g)?.map((n) => Number(n));
  if (!nums || nums.length < 4) return null;
  const [x, y, width, height] = nums;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    width < 120 ||
    height < 120
  ) {
    return null;
  }
  return { x, y, width, height };
}

/**
 * Parse AppleScript `bounds` list `{x1, y1, x2, y2}` → Rect.
 */
export function parseAppleBoundsList(out: string): Rect | null {
  const nums = out.match(/-?\d+/g)?.map((n) => Number(n));
  if (!nums || nums.length < 4) return null;
  const [x1, y1, x2, y2] = nums;
  if (
    typeof x1 !== "number" ||
    typeof y1 !== "number" ||
    typeof x2 !== "number" ||
    typeof y2 !== "number" ||
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    x2 - x1 < 120 ||
    y2 - y1 < 120
  ) {
    return null;
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function computePanelPosition(
  settings: Rect | null,
  ww: number,
  wh: number,
  nearPoint?: { x: number; y: number } | null,
): { x: number; y: number } {
  if (settings) {
    // Detail pane ≈ right of the sidebar on Ventura+ System Settings.
    const sidebar = Math.min(
      300,
      Math.max(240, Math.round(settings.width * 0.34)),
    );
    const padX = 20;
    const padBottom = 36;
    const padTop = 96;

    const contentLeft = settings.x + sidebar;
    const contentRight = settings.x + settings.width - padX;
    const contentWidth = Math.max(contentRight - contentLeft, ww);

    let x = contentLeft + (contentWidth - ww) / 2;
    // Sit just above the bottom edge, overlapping the app list (reference UX).
    let y = settings.y + settings.height - wh - padBottom;

    // Hard clamp: panel must stay fully inside the Settings frame.
    const minX = settings.x + padX;
    const maxX = settings.x + settings.width - ww - padX;
    const minY = settings.y + padTop;
    const maxY = settings.y + settings.height - wh - 12;
    if (maxX >= minX) x = Math.min(Math.max(x, minX), maxX);
    else x = settings.x + Math.max(0, (settings.width - ww) / 2);
    if (maxY >= minY) y = Math.min(Math.max(y, minY), maxY);
    else y = settings.y + Math.max(0, (settings.height - wh) / 2);

    return clampToWorkArea(x, y, ww, wh);
  }

  // No Settings bounds yet: park near the Grant button / Atmos window on the
  // same display — not the primary display's bottom edge.
  const anchor = nearPoint ?? { x: 0, y: 0 };
  const display = screen.getDisplayNearestPoint({
    x: Math.round(anchor.x + ww / 2),
    y: Math.round(anchor.y + wh / 2),
  });
  const { width: sw, height: sh, x: sx, y: sy } = display.workArea;
  return {
    x: Math.round(
      Math.min(
        Math.max(anchor.x, sx + 12),
        sx + sw - ww - 12,
      ),
    ),
    y: Math.round(
      Math.min(
        Math.max(anchor.y - 24, sy + 48),
        sy + sh - wh - 24,
      ),
    ),
  };
}

