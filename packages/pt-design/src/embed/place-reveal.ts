import { PLACE_VIEWPORT_CHROME } from "../editor/place-clear";

export const PLACE_REVEAL_MS = 2250;
export const AGENT_REVEAL_MS = 2400;
export const PLACE_SCROLL_CHROME = PLACE_VIEWPORT_CHROME;

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

function ptInstanceId(el: unknown): string | undefined {
  if (!el || typeof el !== "object") return undefined;
  const id = (el as { customData?: { pt?: { id?: string } } }).customData?.pt?.id;
  return typeof id === "string" ? id : undefined;
}

export function elementsForPtIds<T extends { id: string; isDeleted?: boolean }>(
  elements: readonly T[],
  ptIds: readonly string[],
): T[] {
  const ids = new Set(ptIds);
  return elements.filter((el) => {
    const id = ptInstanceId(el);
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

/**
 * Keep zoom. Pan so `rect` sits in the usable viewport (catalog chrome inset).
 * Do not call Excalidraw `scrollToContent` — that records camera History.
 */
export function cameraToShowRect(
  rect: RevealRect,
  appState: { zoom: { value: number }; width: number; height: number },
  chrome: { left: number; top: number; right: number; bottom: number } = PLACE_SCROLL_CHROME,
): { scrollX: number; scrollY: number; zoom: { value: number } } {
  const zoom = appState.zoom.value || 1;
  const usableW = Math.max(1, appState.width - chrome.left - chrome.right);
  const usableH = Math.max(1, appState.height - chrome.top - chrome.bottom);
  const rw = rect.w * zoom;
  const rh = rect.h * zoom;
  const screenX = rw < usableW ? chrome.left + (usableW - rw) / 2 : chrome.left;
  const screenY = rh < usableH ? chrome.top + (usableH - rh) / 2 : chrome.top;
  return {
    scrollX: screenX / zoom - rect.x,
    scrollY: screenY / zoom - rect.y,
    zoom: { value: zoom },
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}
