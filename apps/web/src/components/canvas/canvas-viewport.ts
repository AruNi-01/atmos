import type { Editor, TLEditorSnapshot } from "tldraw";

import type { CanvasTldrawSession } from "./use-canvas-board";

/** True when saved session includes a page camera we can trust on cold load. */
export function hasTrustedSessionViewport(
  session: CanvasTldrawSession | null | undefined,
  pageId: string,
): boolean {
  if (!session || typeof session !== "object") {
    return false;
  }

  const pageStates = (session as { pageStates?: unknown }).pageStates;
  if (!Array.isArray(pageStates)) {
    return false;
  }

  for (const raw of pageStates) {
    if (!raw || typeof raw !== "object") continue;
    const ps = raw as { pageId?: string; camera?: { z?: number } };
    if (ps.pageId !== pageId) continue;
    const z = ps.camera?.z;
    return typeof z === "number" && Number.isFinite(z) && z > 0;
  }

  return false;
}

function isTrustedCameraZoom(z: unknown): z is number {
  return typeof z === "number" && Number.isFinite(z) && z > 0 && z < 1e6;
}

/** Drop corrupt camera entries before persisting session to UI prefs. */
export function sanitizeCanvasSessionForPersist(
  session: CanvasTldrawSession,
): CanvasTldrawSession {
  if (!session || typeof session !== "object") {
    return session;
  }

  const pageStates = (session as { pageStates?: unknown }).pageStates;
  if (!Array.isArray(pageStates)) {
    return session;
  }

  let changed = false;
  const nextPageStates = pageStates.map((raw) => {
    if (!raw || typeof raw !== "object") {
      return raw;
    }
    const ps = raw as {
      pageId?: string;
      camera?: { x?: number; y?: number; z?: number };
    };
    const z = ps.camera?.z;
    if (ps.camera === undefined || isTrustedCameraZoom(z)) {
      return raw;
    }
    changed = true;
    const { camera: _camera, ...rest } = ps;
    return rest;
  });

  if (!changed) {
    return session;
  }

  return {
    ...session,
    pageStates: nextPageStates,
  } as CanvasTldrawSession;
}

/** Fit the editor camera to visible page content (no animation). */
export function fitCanvasEditorToPageContent(editor: Editor): boolean {
  try {
    const bounds = editor.getCurrentPageBounds();
    if (
      !bounds ||
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      !Number.isFinite(bounds.x) ||
      !Number.isFinite(bounds.y) ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height)
    ) {
      return false;
    }
    editor.zoomToBounds(bounds, { inset: 48, immediate: true });
    return true;
  } catch {
    return false;
  }
}

/** Re-apply a bad or missing zoom without reloading the document store. */
export function recoverCanvasViewportIfNeeded(editor: Editor): boolean {
  try {
    const z = editor.getCamera().z;
    if (!isTrustedCameraZoom(z)) {
      return fitCanvasEditorToPageContent(editor);
    }
    return false;
  } catch {
    return false;
  }
}

/** Re-apply persisted session without replacing the loaded document. */
export function loadCanvasSessionIntoEditor(
  editor: Editor,
  session: CanvasTldrawSession | null | undefined,
): void {
  if (!session) {
    return;
  }

  editor.loadSnapshot(
    { session: sanitizeCanvasSessionForPersist(session) },
    { forceOverwriteSessionState: true },
  );
  recoverCanvasViewportIfNeeded(editor);
}
