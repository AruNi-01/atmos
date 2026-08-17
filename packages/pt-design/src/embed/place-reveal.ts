export const PLACE_REVEAL_MS = 2250;
export const PLACE_SCROLL_OFFSETS = { top: 56, right: 376, bottom: 56, left: 8 };

export type RevealRect = { x: number; y: number; w: number; h: number };
export type RevealBox = { left: number; top: number; width: number; height: number };

export function unionElementBounds(
  elements: readonly { x: number; y: number; width: number; height: number }[],
): RevealRect | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function elementsForInstances<T extends { isDeleted?: boolean; customData?: { pt?: { instanceId?: string } } }>(
  elements: readonly T[],
  instanceIds: readonly string[],
): T[] {
  const ids = new Set(instanceIds);
  return elements.filter((el) => {
    const id = el.customData?.pt?.instanceId;
    return Boolean(id && ids.has(id) && !el.isDeleted);
  });
}

export function selectedIdsForElements(elements: readonly { id: string }[]): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const el of elements) next[el.id] = true;
  return next;
}

export function sceneRectToBoardBox(
  rect: RevealRect,
  appState: { scrollX: number; scrollY: number; zoom: { value: number } },
  pad = 6,
): RevealBox {
  const zoom = appState.zoom.value || 1;
  return {
    left: (rect.x + appState.scrollX) * zoom - pad,
    top: (rect.y + appState.scrollY) * zoom - pad,
    width: rect.w * zoom + pad * 2,
    height: rect.h * zoom + pad * 2,
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
