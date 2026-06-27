import type { Editor, TLShapeId } from "tldraw";

const FOCUS_PULSE_MS = 2_400;
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
      editor.zoomToBounds(bounds, {
        inset: ids.length === 1 ? 96 : 72,
        animation: { duration: 320 },
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
