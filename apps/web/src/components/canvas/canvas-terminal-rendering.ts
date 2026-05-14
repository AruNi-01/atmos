import type { CanvasTerminalShape } from "./canvas-terminal-shape";

type TerminalRenderTimestamp = number | null;

export type CanvasTerminalRenderShape = Pick<CanvasTerminalShape, "id"> & {
  props: Pick<CanvasTerminalShape["props"], "lastAttachedAt">;
};

function getSortableTimestamp(lastAttachedAt: TerminalRenderTimestamp) {
  return typeof lastAttachedAt === "number" ? lastAttachedAt : Number.NEGATIVE_INFINITY;
}

function compareByAttachTimeDesc(
  left: CanvasTerminalRenderShape,
  right: CanvasTerminalRenderShape,
) {
  const timestampDelta =
    getSortableTimestamp(right.props.lastAttachedAt) - getSortableTimestamp(left.props.lastAttachedAt);
  if (timestampDelta !== 0) {
    return timestampDelta;
  }
  return left.id.localeCompare(right.id);
}

export function getRestoredRenderedShapeIds(
  shapes: CanvasTerminalRenderShape[],
  maxRenderedTerminals: number,
): CanvasTerminalRenderShape["id"][] {
  if (maxRenderedTerminals < 1) {
    return [];
  }

  return shapes
    .filter((shape) => typeof shape.props.lastAttachedAt === "number")
    .sort(compareByAttachTimeDesc)
    .slice(0, maxRenderedTerminals)
    .map((shape) => shape.id);
}

export function trimRenderedShapeIds(
  shapes: CanvasTerminalRenderShape[],
  renderedShapeIds: CanvasTerminalRenderShape["id"][],
  maxRenderedTerminals: number,
): CanvasTerminalRenderShape["id"][] {
  if (maxRenderedTerminals < 1 || renderedShapeIds.length === 0) {
    return [];
  }

  const renderedShapeIdSet = new Set(renderedShapeIds);
  return shapes
    .filter((shape) => renderedShapeIdSet.has(shape.id))
    .sort(compareByAttachTimeDesc)
    .slice(0, maxRenderedTerminals)
    .map((shape) => shape.id);
}

export function promoteRenderedShapeId(
  shapes: CanvasTerminalRenderShape[],
  renderedShapeIds: CanvasTerminalRenderShape["id"][],
  shapeId: CanvasTerminalRenderShape["id"],
  attachedAt: number,
  maxRenderedTerminals: number,
): CanvasTerminalRenderShape["id"][] {
  if (maxRenderedTerminals < 1) {
    return [];
  }

  const renderedShapeIdSet = new Set(renderedShapeIds);
  renderedShapeIdSet.add(shapeId);

  return shapes
    .filter((shape) => renderedShapeIdSet.has(shape.id) || shape.id === shapeId)
    .map((shape) =>
      shape.id === shapeId
        ? {
            ...shape,
            props: {
              ...shape.props,
              lastAttachedAt: attachedAt,
            },
          }
        : shape,
    )
    .sort(compareByAttachTimeDesc)
    .slice(0, maxRenderedTerminals)
    .map((shape) => shape.id);
}
