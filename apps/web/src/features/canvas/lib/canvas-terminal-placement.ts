import type { TLEditorSnapshot } from "tldraw";

import { isCanvasTerminalShapeRecord } from "./canvas-terminal-shape";

export type CanvasPlacementRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const PLACEMENT_GAP = 32;
/** Max distance from content cluster center when spiraling (page units). */
const MAX_SEARCH_RADIUS = 900;
const SPIRAL_STEP = 72;
/** Fallback viewport size when inferring page center from saved session camera. */
const ASSUMED_VIEWPORT_W = 1280;
const ASSUMED_VIEWPORT_H = 800;

function isShapeRecord(value: unknown): value is {
  typeName: "shape";
  parentId: string;
  x: number;
  y: number;
  type?: string;
  props?: { w?: number; h?: number };
} {
  if (!value || typeof value !== "object") return false;
  const r = value as { typeName?: string };
  return r.typeName === "shape";
}

function shapeBounds(record: {
  x: number;
  y: number;
  type?: string;
  props?: { w?: number; h?: number };
}): CanvasPlacementRect {
  const props = record.props;
  let w = typeof props?.w === "number" && props.w > 0 ? props.w : 160;
  let h = typeof props?.h === "number" && props.h > 0 ? props.h : 80;
  if (record.type === "note") {
    w = typeof props?.w === "number" && props.w > 0 ? props.w : 200;
    h = 200;
  }
  return { x: record.x, y: record.y, w, h };
}

function rectsOverlap(a: CanvasPlacementRect, b: CanvasPlacementRect, gap: number): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function fits(candidate: CanvasPlacementRect, occupied: CanvasPlacementRect[], gap: number): boolean {
  return !occupied.some((rect) => rectsOverlap(candidate, rect, gap));
}

function unionBounds(rects: CanvasPlacementRect[]): CanvasPlacementRect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function unionCenter(rects: CanvasPlacementRect[]): { x: number; y: number } | null {
  const box = unionBounds(rects);
  if (!box) return null;
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** Collect page-space bounds for shapes on `pageId` (optionally skip one id). */
export function collectPageShapeBounds(
  snapshot: TLEditorSnapshot,
  pageId: string,
  skipShapeId?: string,
): CanvasPlacementRect[] {
  const store = snapshot.document.store as Record<string, unknown>;
  const rects: CanvasPlacementRect[] = [];

  for (const record of Object.values(store)) {
    if (!isShapeRecord(record)) continue;
    if (record.parentId !== pageId) continue;
    if (skipShapeId && (record as { id?: string }).id === skipShapeId) continue;
    rects.push(shapeBounds(record));
  }

  return rects;
}

/**
 * Infer the page point at the viewport center from a saved tldraw session snapshot.
 */
export function getViewportCenterFromSession(
  snapshot: TLEditorSnapshot,
  pageId: string,
): { x: number; y: number } | null {
  const session = snapshot.session as unknown as Record<string, unknown> | undefined;
  if (!session) return null;

  const pageStates = session.pageStates;
  if (!Array.isArray(pageStates)) return null;

  for (const raw of pageStates) {
    if (!raw || typeof raw !== "object") continue;
    const ps = raw as { pageId?: string; camera?: { x?: number; y?: number; z?: number } };
    if (ps.pageId !== pageId) continue;
    const cam = ps.camera;
    if (!cam || typeof cam.x !== "number" || typeof cam.y !== "number") continue;
    const z = typeof cam.z === "number" && cam.z > 0 ? cam.z : 1;
    return {
      x: -cam.x / z + ASSUMED_VIEWPORT_W / (2 * z),
      y: -cam.y / z + ASSUMED_VIEWPORT_H / (2 * z),
    };
  }

  return null;
}

/** Positions flush against the content cluster — tried before wider spiral search. */
function adjacentToContent(
  content: CanvasPlacementRect,
  terminal: { w: number; h: number },
): Array<{ x: number; y: number }> {
  const { w, h } = terminal;
  const g = PLACEMENT_GAP;
  return [
    { x: content.x + content.w + g, y: content.y },
    { x: content.x + content.w + g, y: content.y + content.h - h },
    { x: content.x - w - g, y: content.y },
    { x: content.x - w - g, y: content.y + content.h - h },
    { x: content.x, y: content.y + content.h + g },
    { x: content.x + content.w - w, y: content.y + content.h + g },
    { x: content.x, y: content.y - h - g },
    { x: content.x + content.w - w, y: content.y - h - g },
  ];
}

/** Ring offsets around a center, closest first (Manhattan rings). */
function* spiralOffsets(maxRadius: number, step: number): Generator<{ dx: number; dy: number }> {
  yield { dx: 0, dy: 0 };
  for (let ring = 1; ring * step <= maxRadius; ring += 1) {
    const d = ring * step;
    yield { dx: d, dy: 0 };
    yield { dx: -d, dy: 0 };
    yield { dx: 0, dy: d };
    yield { dx: 0, dy: -d };
    yield { dx: d, dy: d };
    yield { dx: -d, dy: d };
    yield { dx: d, dy: -d };
    yield { dx: -d, dy: -d };
    yield { dx: d, dy: d / 2 };
    yield { dx: -d, dy: d / 2 };
  }
}

function pickAnchor(
  contentBounds: CanvasPlacementRect | null,
  contentCenter: { x: number; y: number } | null,
  viewportCenter: { x: number; y: number } | null,
): { x: number; y: number } {
  if (contentCenter) {
    if (viewportCenter && contentBounds) {
      const expanded = {
        x: contentBounds.x - 400,
        y: contentBounds.y - 300,
        w: contentBounds.w + 800,
        h: contentBounds.h + 600,
      };
      const inside =
        viewportCenter.x >= expanded.x &&
        viewportCenter.x <= expanded.x + expanded.w &&
        viewportCenter.y >= expanded.y &&
        viewportCenter.y <= expanded.y + expanded.h;
      if (inside) return viewportCenter;
    }
    return contentCenter;
  }
  return viewportCenter ?? { x: 400, y: 300 };
}

/**
 * Find a non-overlapping top-left position for a new canvas terminal close to
 * the main content cluster (diagrams, notes, frames) without overlapping them.
 */
export function findCanvasTerminalPlacement(
  snapshot: TLEditorSnapshot,
  pageId: string,
  terminalSize: { w: number; h: number },
  options?: { skipShapeId?: string },
): { x: number; y: number } {
  const store = snapshot.document.store as Record<string, unknown>;
  const occupied: CanvasPlacementRect[] = [];
  const nonTerminal: CanvasPlacementRect[] = [];

  for (const record of Object.values(store)) {
    if (!isShapeRecord(record)) continue;
    if (record.parentId !== pageId) continue;
    const id = (record as { id?: string }).id;
    if (options?.skipShapeId && id === options.skipShapeId) continue;
    const rect = shapeBounds(record);
    occupied.push(rect);
    if (!isCanvasTerminalShapeRecord(record)) {
      nonTerminal.push(rect);
    }
  }

  const contentBounds = unionBounds(nonTerminal);
  const contentCenter = unionCenter(nonTerminal);
  const viewportCenter = getViewportCenterFromSession(snapshot, pageId);
  const anchor = pickAnchor(contentBounds, contentCenter, viewportCenter);

  const w = terminalSize.w;
  const h = terminalSize.h;

  if (contentBounds) {
    for (const pos of adjacentToContent(contentBounds, { w, h })) {
      const candidate: CanvasPlacementRect = { x: pos.x, y: pos.y, w, h };
      if (fits(candidate, occupied, PLACEMENT_GAP)) {
        return pos;
      }
    }
  }

  const originX = anchor.x - w / 2;
  const originY = anchor.y - h / 2;

  for (const { dx, dy } of spiralOffsets(MAX_SEARCH_RADIUS, SPIRAL_STEP)) {
    const x = originX + dx;
    const y = originY + dy;
    const candidate: CanvasPlacementRect = { x, y, w, h };
    if (!fits(candidate, occupied, PLACEMENT_GAP)) continue;
    if (contentCenter && distance({ x: x + w / 2, y: y + h / 2 }, contentCenter) > MAX_SEARCH_RADIUS + w) {
      continue;
    }
    return { x, y };
  }

  if (contentBounds) {
    return {
      x: contentBounds.x + contentBounds.w + PLACEMENT_GAP,
      y: contentBounds.y,
    };
  }

  return { x: anchor.x - w / 2, y: anchor.y - h / 2 };
}
