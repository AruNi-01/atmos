import type { Editor } from "tldraw";

import { collectContentOccupiedRects } from "./canvas-agent-lint";

export const DEFAULT_SPAWN_GAP = 28;
/** Default geo size used when creating without explicit w/h. */
export const DEFAULT_GEO_SIZE = { w: 200, h: 200 };
export const DEFAULT_NOTE_SIZE = { w: 200, h: 200 };
export const DEFAULT_FRAME_SIZE = { w: 640, h: 440 };

type Rect = { x: number; y: number; w: number; h: number };

function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function fits(candidate: Rect, occupied: Rect[], gap: number): boolean {
  return !occupied.some((rect) => rectsOverlap(candidate, rect, gap));
}

/**
 * Find a page-space top-left for a new shape that does not overlap existing
 * content/widgets. Prefers the viewport center, then spirals outward.
 *
 * This replaces the old fixed 120×80 grid (which was smaller than default
 * geo 200×200 and caused guaranteed stacking).
 */
export function findNonOverlappingSpawn(
  editor: Editor,
  size: { w: number; h: number },
  options?: {
    gap?: number;
    excludeIds?: ReadonlySet<string>;
  },
): { x: number; y: number } {
  const gap = options?.gap ?? DEFAULT_SPAWN_GAP;
  const w = Math.max(8, size.w);
  const h = Math.max(8, size.h);
  const occupied = collectContentOccupiedRects(editor, options?.excludeIds);

  const viewport = editor.getViewportPageBounds();
  const originX = viewport.center.x - w / 2;
  const originY = viewport.center.y - h / 2;

  const first: Rect = { x: originX, y: originY, w, h };
  if (fits(first, occupied, gap)) {
    return { x: originX, y: originY };
  }

  // Spiral search in steps of (size + gap), covering expanding rings.
  const stepX = w + gap;
  const stepY = h + gap;
  const maxRing = 24;

  for (let ring = 1; ring <= maxRing; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = originX + dx * stepX;
        const y = originY + dy * stepY;
        const candidate: Rect = { x, y, w, h };
        if (fits(candidate, occupied, gap)) {
          return { x, y };
        }
      }
    }
  }

  // Fallback: place below the union of all occupied content.
  if (occupied.length) {
    let maxY = -Infinity;
    let minX = Infinity;
    for (const r of occupied) {
      if (r.y + r.h > maxY) maxY = r.y + r.h;
      if (r.x < minX) minX = r.x;
    }
    return {
      x: Number.isFinite(minX) ? minX : originX,
      y: (Number.isFinite(maxY) ? maxY : originY) + gap,
    };
  }

  return { x: originX, y: originY };
}
