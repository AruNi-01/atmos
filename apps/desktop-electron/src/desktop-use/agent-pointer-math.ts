/**
 * Pure geometry / motion helpers for the Desktop Use agent pointer.
 * No Electron imports — unit-testable offline.
 */

export type Point = { x: number; y: number };

export type DisplayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Union of display rects into a single virtual desktop bounds (multi-monitor). */
export function unionDisplayBounds(displays: DisplayRect[]): DisplayRect {
  if (displays.length === 0) {
    return { x: 0, y: 0, width: 1280, height: 800 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of displays) {
    minX = Math.min(minX, d.x);
    minY = Math.min(minY, d.y);
    maxX = Math.max(maxX, d.x + d.width);
    maxY = Math.max(maxY, d.y + d.height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Ease-out cubic for cursor travel. */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolatePoint(from: Point, to: Point, t: number): Point {
  const e = easeOutCubic(t);
  return { x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e) };
}

/** Travel duration ms from distance (px), clamped. */
export function travelDurationMs(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  // ~1.2ms per px, min 120ms, max 480ms — snappy but readable
  return Math.round(Math.min(480, Math.max(120, dist * 1.2)));
}

/** Convert screen point to overlay-local coords given virtual bounds origin. */
export function screenToOverlay(
  screen: Point,
  bounds: DisplayRect,
): Point {
  return { x: screen.x - bounds.x, y: screen.y - bounds.y };
}

export type AgentPointerEvent =
  | { kind: "show"; x: number; y: number; label?: string }
  | { kind: "move"; x: number; y: number }
  | { kind: "click"; x: number; y: number }
  | { kind: "type"; x: number; y: number; textPreview?: string }
  | { kind: "hide" };

export function isValidScreenPoint(x: unknown, y: unknown): x is number {
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y)
  );
}
