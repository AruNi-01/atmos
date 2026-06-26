import type { Editor, TLFrameShape, TLShape, TLShapeId } from "tldraw";

export type CanvasFrameTarget = {
  id: TLShapeId;
  name: string;
};

function isFrameShape(shape: TLShape | undefined): shape is TLFrameShape {
  return shape?.type === "frame";
}

export function listCanvasFrameTargets(editor: Editor): CanvasFrameTarget[] {
  return editor
    .getCurrentPageShapes()
    .filter(isFrameShape)
    .map((shape) => ({
      id: shape.id,
      name:
        typeof shape.props.name === "string" && shape.props.name.trim()
          ? shape.props.name
          : "Frame",
    }));
}

export function resolveCanvasInheritedFrameId(
  editor: Editor,
  sourceShapeId: TLShapeId,
): TLShapeId | null {
  const sourceShape = editor.getShape(sourceShapeId);
  if (!sourceShape) {
    return null;
  }
  const parent = editor.getShape(sourceShape.parentId as TLShapeId);
  return isFrameShape(parent) ? parent.id : null;
}

export function getCanvasShapeFrameKey(editor: Editor, shape: TLShape): string {
  const parent = editor.getShape(shape.parentId as TLShapeId);
  return isFrameShape(parent) ? parent.id : "unframed";
}

export function reparentCanvasShapeToFrame(
  editor: Editor,
  shapeId: TLShapeId,
  frameId: TLShapeId | null,
) {
  if (!frameId) {
    return;
  }
  const frame = editor.getShape(frameId);
  if (!isFrameShape(frame)) {
    return;
  }
  editor.reparentShapes([shapeId], frameId);
}
