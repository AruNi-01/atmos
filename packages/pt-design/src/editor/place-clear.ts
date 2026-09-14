export type PlaceRect = { x: number; y: number; w: number; h: number };

export const PLACE_GAP = 24;
export const PLACE_VIEW_INSET = 80;

/** Keep new catalog inserts off the left/top chrome and the right catalog drawer. */
export const PLACE_VIEWPORT_CHROME = { left: 24, top: 72, right: 376, bottom: 64 };

export function rectsOverlap(a: PlaceRect, b: PlaceRect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

export function occupiedNodeRects(
  nodes: readonly { x: number; y: number; width: number; height: number }[],
): PlaceRect[] {
  return nodes.map((node) => ({ x: node.x, y: node.y, w: node.width, h: node.height }));
}

export function lastVisibleNodeRect(
  nodes: readonly { x: number; y: number; width: number; height: number }[],
  viewport?: PlaceRect,
): PlaceRect | undefined {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    const rect = { x: node.x, y: node.y, w: node.width, h: node.height };
    if (!viewport || rectsOverlap(rect, viewport)) return rect;
  }
  return undefined;
}

export function sceneViewportRect(
  appState: {
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
    width: number;
    height: number;
  },
  chrome: { left?: number; top?: number; right?: number; bottom?: number } = {},
): PlaceRect {
  const zoom = appState.zoom.value || 1;
  const left = (chrome.left ?? 0) / zoom;
  const top = (chrome.top ?? 0) / zoom;
  const right = (chrome.right ?? 0) / zoom;
  const bottom = (chrome.bottom ?? 0) / zoom;
  return {
    x: -appState.scrollX + left,
    y: -appState.scrollY + top,
    w: Math.max(1, appState.width / zoom - left - right),
    h: Math.max(1, appState.height / zoom - top - bottom),
  };
}

export function preferredPlaceOrigin(
  last: PlaceRect | undefined,
  viewport: PlaceRect | undefined,
  size: { w: number; h: number },
  gap = PLACE_GAP,
): { x: number; y: number; wrapX: number } {
  const viewOrigin = {
    x: (viewport?.x ?? 0) + (viewport ? 0 : PLACE_VIEW_INSET),
    y: (viewport?.y ?? 0) + (viewport ? 0 : PLACE_VIEW_INSET),
  };
  if (!last) return { ...viewOrigin, wrapX: viewOrigin.x };

  const toRight = { x: last.x + last.w + gap, y: last.y };
  if (!viewport || toRight.x + size.w <= viewport.x + viewport.w) {
    return { ...toRight, wrapX: last.x };
  }
  const below = { x: last.x, y: last.y + last.h + gap };
  return { ...below, wrapX: last.x };
}

export function findClearPlacement(
  occupied: PlaceRect[],
  size: { w: number; h: number },
  origin: { x: number; y: number },
  opts?: { gap?: number; viewport?: PlaceRect; wrapX?: number },
): { x: number; y: number } {
  const gap = opts?.gap ?? PLACE_GAP;
  const wrapX = opts?.wrapX ?? origin.x;
  const viewport = opts?.viewport;

  const fits = (x: number, y: number) =>
    !occupied.some((item) => rectsOverlap({ x, y, w: size.w, h: size.h }, item, gap));

  const minX = viewport ? viewport.x : Math.min(origin.x, wrapX);
  const maxX = viewport ? viewport.x + viewport.w - size.w : origin.x + Math.max(size.w * 10, 2400);
  const maxY = viewport ? viewport.y + viewport.h - size.h : Number.POSITIVE_INFINITY;

  const inViewport = (x: number, y: number) => {
    if (!viewport) return true;
    return x <= maxX + 1 && y <= maxY + 1 && x >= viewport.x - 1 && y >= viewport.y - 1;
  };

  if (fits(origin.x, origin.y) && inViewport(origin.x, origin.y)) {
    return { x: origin.x, y: origin.y };
  }

  let y = origin.y;
  for (let row = 0; row < 80; row++) {
    let x = row === 0 ? origin.x : wrapX;
    if (viewport && x > maxX) x = minX;
    let guard = 0;
    while (x <= maxX + (viewport ? 0 : size.w * 2) && guard < 120) {
      guard += 1;
      if (fits(x, y)) return { x, y };
      const hits = occupied.filter((item) =>
        rectsOverlap({ x, y, w: size.w, h: size.h }, item, gap),
      );
      const jump = hits.length
        ? Math.max(...hits.map((item) => item.x + item.w + gap))
        : x + size.w + gap;
      x = jump > x ? jump : x + size.w + gap;
    }
    y += size.h + gap;
  }

  const bottom = occupied.reduce((max, item) => Math.max(max, item.y + item.h), origin.y);
  return { x: wrapX, y: bottom + gap };
}

export function catalogPlaceAt(
  nodes: readonly { x: number; y: number; width: number; height: number }[],
  size: { w: number; h: number },
  viewport?: PlaceRect,
): { x: number; y: number } {
  const occupied = occupiedNodeRects(nodes);
  const last = lastVisibleNodeRect(nodes, viewport);
  const origin = preferredPlaceOrigin(last, viewport, size);
  return findClearPlacement(occupied, size, origin, {
    viewport,
    wrapX: origin.wrapX,
  });
}
