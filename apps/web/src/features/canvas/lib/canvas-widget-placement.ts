import type { Editor, TLShapeId } from "tldraw";

const DEFAULT_GAP = 32;

export function findCanvasWidgetPlacement(
  editor: Editor,
  size: { w: number; h: number },
  options?: {
    frameId?: TLShapeId | null;
    sourceShapeId?: TLShapeId | null;
  },
): { x: number; y: number } {
  if (options?.sourceShapeId) {
    const source = editor.getShape(options.sourceShapeId);
    if (source) {
      const sourceW =
        typeof (source.props as { w?: unknown }).w === "number"
          ? ((source.props as { w: number }).w)
          : 360;
      return {
        x: source.x + sourceW + DEFAULT_GAP,
        y: source.y,
      };
    }
  }

  if (options?.frameId) {
    const frame = editor.getShape(options.frameId);
    if (frame?.type === "frame") {
      return {
        x: frame.x + 24,
        y: frame.y + 56,
      };
    }
  }

  const viewportCenter = editor.getViewportPageBounds().center;
  return {
    x: viewportCenter.x - size.w / 2,
    y: viewportCenter.y - size.h / 2,
  };
}
