import type { Editor, TLShapeId } from "tldraw";

import { writeLastPinnedTerminal, type CanvasLastPinnedTerminal } from "@/shared/stores/use-ui-pref-hooks";

import {
  getCanvasTerminalShapes,
  type CanvasTerminalShape,
} from "./canvas-terminal-shape";
import { promoteRenderedShapeId } from "./canvas-terminal-rendering";

const FOCUS_PULSE_MS = 2_400;

export function rememberLastPinnedTerminal(
  boardGuid: string | undefined,
  pinKey: string,
  shapeId: string,
): void {
  const entry: CanvasLastPinnedTerminal = {
    pinKey,
    shapeId,
    pinnedAt: Date.now(),
  };
  writeLastPinnedTerminal(entry, boardGuid);
}

export function findPinnedTerminalShape(
  editor: Editor,
  hint: Pick<CanvasLastPinnedTerminal, "pinKey" | "shapeId">,
): CanvasTerminalShape | null {
  const shapes = getCanvasTerminalShapes(editor);
  const byId = shapes.find((shape) => shape.id === hint.shapeId);
  if (byId) return byId;
  return shapes.find((shape) => shape.props.pinKey === hint.pinKey) ?? null;
}

export function focusCanvasTerminalShape(
  editor: Editor,
  shape: CanvasTerminalShape,
  options: {
    maxRenderedTerminals: number;
    setActiveShapeId: (id: TLShapeId) => void;
    setRenderedShapeIds: (ids: TLShapeId[]) => void;
    renderedShapeIds: TLShapeId[];
    setFocusPulseShapeId: (id: TLShapeId | null) => void;
    animateCamera?: boolean;
  },
): void {
  const shapeId = shape.id as TLShapeId;
  const attachedAt = Date.now();

  const nextRendered = promoteRenderedShapeId(
    getCanvasTerminalShapes(editor),
    options.renderedShapeIds,
    shapeId,
    attachedAt,
    options.maxRenderedTerminals,
  );
  options.setRenderedShapeIds(nextRendered);
  options.setActiveShapeId(shapeId);

  try {
    editor.select(shapeId);
    editor.updateShape({
      id: shapeId,
      type: shape.type,
      props: { lastAttachedAt: attachedAt },
    });
  } catch {
    // Editor may still be hydrating.
  }

  const bounds = editor.getShapePageBounds(shapeId);
  if (bounds && options.animateCamera !== false) {
    try {
      editor.zoomToBounds(
        { x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY },
        { animation: { duration: 320 } },
      );
    } catch {
      // ignore
    }
  }

  options.setFocusPulseShapeId(shapeId);
  window.setTimeout(() => {
    options.setFocusPulseShapeId(null);
  }, FOCUS_PULSE_MS);
}
