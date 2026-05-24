/**
 * Canvas camera/session sanity helpers.
 *
 * Scope: defensive code against a *corrupt persisted camera* (NaN / Infinity /
 * zoom ≤ 0 / extreme x-y pan) — e.g. if a JS error once wrote a bad value
 * into localStorage, this module prevents that corruption from being re-loaded
 * and re-persisted forever.
 *
 * NOT in scope: the Desktop "single click blanks the canvas" symptom. That is
 * a WebKit/WKWebView paint bug caused by tldraw's `content-visibility: auto`
 * on `.tl-canvas` and is fixed by a CSS override in `apps/web/src/app/globals.css`
 * (see the `.tldraw-wrapper .tl-canvas { content-visibility: visible }` block).
 * Don't try to "fix" blank-canvas here — the camera is fine in that case.
 */
import type { Editor, TLEditorSnapshot } from "tldraw";

import type { CanvasTldrawSession } from "@/shared/types/canvas";

const MAX_CAMERA_AXIS = 1e9;

function isTrustedCameraZoom(z: unknown): z is number {
  return typeof z === "number" && Number.isFinite(z) && z > 0 && z < 1e6;
}

function isTrustedCameraAxis(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_CAMERA_AXIS
  );
}

/** True when a persisted page camera is safe to restore on cold load. */
export function isTrustedPageCamera(
  camera: { x?: number; y?: number; z?: number } | undefined,
): boolean {
  if (!camera) {
    return false;
  }
  return (
    isTrustedCameraAxis(camera.x) &&
    isTrustedCameraAxis(camera.y) &&
    isTrustedCameraZoom(camera.z)
  );
}

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
    const ps = raw as { pageId?: string; camera?: { x?: number; y?: number; z?: number } };
    if (ps.pageId !== pageId) continue;
    return isTrustedPageCamera(ps.camera);
  }

  return false;
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
    if (ps.camera === undefined || isTrustedPageCamera(ps.camera)) {
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

/**
 * True when the page has drawable content but nothing intersects the viewport.
 * tldraw culls off-screen shapes (display:none); a bad camera pan looks like a black canvas
 * while chrome stays visible — common on Desktop WKWebView after clicks/gestures.
 */
export function isCanvasPageContentOffscreen(editor: Editor): boolean {
  try {
    const pageBounds = editor.getCurrentPageBounds();
    if (
      !pageBounds ||
      pageBounds.width <= 0 ||
      pageBounds.height <= 0 ||
      editor.getCurrentPageShapes().length === 0
    ) {
      return false;
    }

    const viewport = editor.getViewportPageBounds();
    if (
      !Number.isFinite(viewport.width) ||
      !Number.isFinite(viewport.height) ||
      viewport.width <= 0 ||
      viewport.height <= 0
    ) {
      return true;
    }

    return editor.getShapeIdsInsideBounds(viewport).size === 0;
  } catch {
    return false;
  }
}

/** Re-apply a bad camera or off-screen viewport without reloading the document store. */
export function recoverCanvasViewportIfNeeded(editor: Editor): boolean {
  try {
    const { z } = editor.getCamera();
    if (!isTrustedCameraZoom(z) || isCanvasPageContentOffscreen(editor)) {
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
