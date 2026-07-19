import type { Editor, TLShapeId } from "tldraw";

const FOCUS_PULSE_MS = 2_400;
/** Never zoom in past 100% on focus — only zoom out when needed to fit. */
const FOCUS_MAX_ZOOM = 1;
/** Screen-space padding around the target bounds (each side). */
const FOCUS_INSET_PX = 64;
const FOCUS_CAMERA_MS = 320;

let focusPulseGeneration = 0;

function uniqueShapeIds(shapeIds: TLShapeId[]) {
  return Array.from(new Set(shapeIds));
}

function areShapeIdListsEqual(left: TLShapeId[], right: TLShapeId[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((shapeId, index) => shapeId === right[index]);
}

function getShapeIdsBounds(editor: Editor, shapeIds: TLShapeId[]) {
  const bounds = shapeIds
    .map((shapeId) => {
      try {
        return editor.getShapePageBounds(shapeId) ?? null;
      } catch {
        return null;
      }
    })
    .filter((candidate): candidate is NonNullable<ReturnType<Editor["getShapePageBounds"]>> =>
      Boolean(candidate),
    );

  if (bounds.length === 0) {
    return null;
  }

  const minX = Math.min(...bounds.map((bound) => bound.minX));
  const minY = Math.min(...bounds.map((bound) => bound.minY));
  const maxX = Math.max(...bounds.map((bound) => bound.maxX));
  const maxY = Math.max(...bounds.map((bound) => bound.maxY));

  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

/**
 * Zoom that fits `bounds` in the viewport with inset padding, never above
 * `maxZoom` (default 100%). Small targets stay at 100% + pan; large unions zoom out.
 */
export function fitZoomForPageBounds(
  editor: Editor,
  bounds: { x: number; y: number; w: number; h: number },
  options?: { maxZoom?: number; insetPx?: number },
): number {
  const maxZoom = options?.maxZoom ?? FOCUS_MAX_ZOOM;
  const insetPx = options?.insetPx ?? FOCUS_INSET_PX;
  const screen = editor.getViewportScreenBounds();
  const availW = Math.max(1, screen.width - insetPx * 2);
  const availH = Math.max(1, screen.height - insetPx * 2);
  const fit = Math.min(availW / Math.max(1, bounds.w), availH / Math.max(1, bounds.h));
  // Cap above at maxZoom; allow zoom-out below 1 when content is larger than the view.
  return Math.min(maxZoom, Math.max(0.05, fit));
}

/**
 * Center the camera on page `bounds`, fitting all of it in view.
 * - Small shapes: pan at ≤100% zoom (no aggressive fit-in).
 * - Large / multi-shape unions: zoom out so everything stays visible.
 */
export function centerCameraOnPageBounds(
  editor: Editor,
  bounds: { x: number; y: number; w: number; h: number },
  options?: {
    /** Force zoom; default is fit-with-cap via {@link fitZoomForPageBounds}. */
    zoom?: number;
    maxZoom?: number;
    insetPx?: number;
    animation?: { duration: number };
  },
): void {
  if (bounds.w <= 0 || bounds.h <= 0) return;
  const zoom =
    options?.zoom ??
    fitZoomForPageBounds(editor, bounds, {
      maxZoom: options?.maxZoom,
      insetPx: options?.insetPx,
    });
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;
  const screen = editor.getViewportScreenBounds();
  const pageW = screen.width / zoom;
  const pageH = screen.height / zoom;
  editor.setCamera(
    {
      x: -(centerX - pageW / 2),
      y: -(centerY - pageH / 2),
      z: zoom,
    },
    options?.animation ? { animation: options.animation } : undefined,
  );
}

export function focusCanvasShapes(
  editor: Editor,
  shapeIds: TLShapeId[],
  options: {
    setFocusPulseShapeIds: (ids: TLShapeId[]) => void;
    getFocusPulseShapeIds?: () => TLShapeId[];
    animateCamera?: boolean;
    select?: boolean;
  },
) {
  const ids = uniqueShapeIds(shapeIds);
  if (ids.length === 0) {
    return false;
  }

  if (options.select !== false) {
    try {
      editor.select(...ids);
    } catch {
      // Editor selection can fail while tldraw is hydrating; keep visual feedback.
    }
  }

  const bounds = getShapeIdsBounds(editor, ids);
  if (bounds && options.animateCamera !== false) {
    try {
      centerCameraOnPageBounds(editor, bounds, {
        animation: { duration: FOCUS_CAMERA_MS },
      });
    } catch {
      // Transient camera failures should not suppress the focus pulse.
    }
  }

  const generation = (focusPulseGeneration += 1);
  options.setFocusPulseShapeIds(ids);
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      if (generation !== focusPulseGeneration) {
        return;
      }
      if (
        options.getFocusPulseShapeIds &&
        !areShapeIdListsEqual(options.getFocusPulseShapeIds(), ids)
      ) {
        return;
      }
      options.setFocusPulseShapeIds([]);
    }, FOCUS_PULSE_MS);
  }

  return true;
}
