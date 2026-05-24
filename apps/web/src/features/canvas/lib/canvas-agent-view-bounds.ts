/** Page-space axis-aligned bounds (plain object for store snapshots). */
export type CanvasAgentBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const AGENT_VIEW_PADDING = 48;

export function expandBounds(bounds: CanvasAgentBounds, padding: number): CanvasAgentBounds {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    w: bounds.w + padding * 2,
    h: bounds.h + padding * 2,
  };
}

export function unionBounds(
  a: CanvasAgentBounds | null,
  b: CanvasAgentBounds | null,
  padding = 0,
): CanvasAgentBounds | null {
  if (!a && !b) return null;
  if (!a) return padding ? expandBounds(b!, padding) : b;
  if (!b) return padding ? expandBounds(a, padding) : a;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  const merged = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  return padding ? expandBounds(merged, padding) : merged;
}

export function boundsFromBox(box: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}): CanvasAgentBounds {
  return {
    x: box.minX,
    y: box.minY,
    w: box.maxX - box.minX,
    h: box.maxY - box.minY,
  };
}

/** Extract shape ids from a successful bus/CLI result payload. */
export function shapeIdsFromAgentResult(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  if (typeof d.id === "string") return [d.id];
  const arrayKeys = [
    "ids",
    "laid_out",
    "aligned",
    "stacked",
    "distributed",
    "moved",
    "selected",
    "deleted",
  ];
  for (const key of arrayKeys) {
    const value = d[key];
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === "string" && v.length > 0);
    }
  }
  return [];
}
