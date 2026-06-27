"use client";

import { useEditor, useValue, type TLShapeId } from "tldraw";
import { cn } from "@workspace/ui";

import { useCanvasRuntimeStore } from "../store/canvas-runtime-store";
import { CANVAS_CARD_CORNER_RADIUS } from "../lib/canvas-shape-indicator";

/**
 * Brief highlight around canvas shapes after creation or focus.
 */
export function CanvasFocusPulse() {
  const editor = useEditor();
  const shapeIds = useCanvasRuntimeStore((state) => state.focusPulseShapeIds);

  if (shapeIds.length === 0) return null;

  return (
    <>
      {shapeIds.map((shapeId) => (
        <TerminalFocusRing key={shapeId} shapeId={shapeId} editor={editor} />
      ))}
    </>
  );
}

function TerminalFocusRing({
  shapeId,
  editor,
}: {
  shapeId: TLShapeId;
  editor: ReturnType<typeof useEditor>;
}) {
  useValue(
    "canvas-terminal.focus-pulse-camera",
    () => {
      const c = editor.getCamera();
      return `${c.x}|${c.y}|${c.z}`;
    },
    [editor],
  );

  let bounds: ReturnType<typeof editor.getShapePageBounds> | null = null;
  try {
    bounds = editor.getShapePageBounds(shapeId) ?? null;
  } catch {
    bounds = null;
  }
  if (!bounds) return null;

  let topLeft: { x: number; y: number };
  let bottomRight: { x: number; y: number };
  try {
    topLeft = editor.pageToViewport({ x: bounds.minX, y: bounds.minY });
    bottomRight = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY });
  } catch {
    return null;
  }

  const width = Math.max(0, bottomRight.x - topLeft.x);
  const height = Math.max(0, bottomRight.y - topLeft.y);
  const pulseOutset = 8;

  return (
    <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
      <div
        style={{
          left: topLeft.x - pulseOutset,
          top: topLeft.y - pulseOutset,
          width: width + pulseOutset * 2,
          height: height + pulseOutset * 2,
          borderRadius: CANVAS_CARD_CORNER_RADIUS + pulseOutset,
        }}
        className={cn(
          "absolute border-2 border-sky-400/90",
          "shadow-[0_0_0_6px_rgba(56,189,248,0.2),0_0_28px_6px_rgba(56,189,248,0.35)]",
          "animate-[canvas-focus-pulse_2400ms_ease-in-out_forwards]",
        )}
      />
    </div>
  );
}
