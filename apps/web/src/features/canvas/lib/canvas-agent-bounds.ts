import type { Editor, TLShape, TLShapeId } from "tldraw";

export type ShapePageBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  midX: number;
  midY: number;
};

export function getShapePageBoundsBox(
  editor: Editor,
  shapeOrId: TLShape | TLShapeId,
): ShapePageBounds | null {
  const box = editor.getShapePageBounds(shapeOrId);
  if (!box) return null;
  return {
    minX: box.minX,
    minY: box.minY,
    maxX: box.maxX,
    maxY: box.maxY,
    width: box.width,
    height: box.height,
    midX: box.midX,
    midY: box.midY,
  };
}

/** Move shape so its page bounds top-left sits at `(minX, minY)`. */
export function moveShapeBoundsTo(
  editor: Editor,
  shape: TLShape,
  minX: number,
  minY: number,
): void {
  const bb = getShapePageBoundsBox(editor, shape.id);
  if (!bb) {
    editor.updateShape({ id: shape.id, type: shape.type, x: minX, y: minY });
    return;
  }
  const dx = minX - bb.minX;
  const dy = minY - bb.minY;
  if (dx === 0 && dy === 0) return;
  editor.updateShape({
    id: shape.id,
    type: shape.type,
    x: shape.x + dx,
    y: shape.y + dy,
  });
}

export function readShapePageSize(
  editor: Editor,
  shape: TLShape,
  fallback = 200,
): { w: number; h: number } {
  const bb = getShapePageBoundsBox(editor, shape.id);
  if (bb) return { w: bb.width, h: bb.height };
  const props = shape.props as Record<string, unknown>;
  const w = typeof props.w === "number" && Number.isFinite(props.w) ? props.w : fallback;
  const h = typeof props.h === "number" && Number.isFinite(props.h) ? props.h : fallback;
  if (shape.type === "note" && typeof props.scale === "number") {
    return { w: 200 * props.scale, h: fallback };
  }
  return { w, h };
}
