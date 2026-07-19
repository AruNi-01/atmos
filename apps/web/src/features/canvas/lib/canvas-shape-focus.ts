import type { Editor, TLShapeId } from "tldraw";

const FOCUS_PULSE_MS = 2_400;
/** Default camera zoom for focus/pulse — 100%, pan only (no fit-zoom). */
const FOCUS_CAMERA_ZOOM = 1;
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
 * Pan the camera so `bounds` is centered at a fixed zoom (default 100%).
 * Avoids `zoomToBounds`, which over-zooms small widgets/terminals on focus pulse.
 */
export function centerCameraOnPageBounds(
  editor: Editor,
  bounds: { x: number; y: number; w: number; h: number },
  options?: {
    zoom?: number;
    animation?: { duration: number };
  },
): void {
  if (bounds.w <= 0 || bounds.h <= 0) return;
  const zoom = options?.zoom ?? FOCUS_CAMERA_ZOOM;
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
        zoom: FOCUS_CAMERA_ZOOM,
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
