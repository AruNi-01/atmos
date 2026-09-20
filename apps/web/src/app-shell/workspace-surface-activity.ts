/**
 * Imperative paint-id for APP-043 visual lead.
 *
 * WorkspaceCenterFrame memo ignores `isActiveContext` so hops do not walk warm
 * trees. Hidden terminals/chats still need to freeze *on the click frame*,
 * before URL-sync React catches up.
 */

export const SURFACE_VISUAL_EVENT = "atmos:surface-visual";

type PaintListener = (id: string | null) => void;

let visualActivePaintId: string | null = null;
let published = false;
const listeners = new Set<PaintListener>();

export function getVisualActivePaintId(): string | null {
  return visualActivePaintId;
}

export function isPaintContextVisuallyActive(
  paintContextId: string | null | undefined,
): boolean {
  if (!published) return true;
  if (paintContextId == null || paintContextId === "") return true;
  return visualActivePaintId === paintContextId;
}

export function publishVisualActivePaintId(id: string | null): void {
  const changed = !published || visualActivePaintId !== id;
  published = true;
  visualActivePaintId = id;
  if (!changed) return;
  for (const listener of listeners) listener(id);
  if (typeof document !== "undefined") {
    document.dispatchEvent(new Event(SURFACE_VISUAL_EVENT));
  }
}

export function subscribeVisualActivePaintId(listener: PaintListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetVisualActivePaintIdForTests(): void {
  visualActivePaintId = null;
  published = false;
  listeners.clear();
}
