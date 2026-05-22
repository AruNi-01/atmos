import {
  createBindingId,
  createShapeId,
  type Editor,
  type TLBindingCreate,
  type TLShape,
  type TLShapeId,
  type VecLike,
} from "tldraw";

function calculateArrowBindingAnchor(
  editor: Editor,
  targetShape: TLShape,
  targetPoint: VecLike,
): VecLike {
  const targetShapePageBounds = editor.getShapePageBounds(targetShape);
  const targetShapeGeometry = editor.getShapeGeometry(targetShape);

  if (!targetShapePageBounds || !targetShapeGeometry) {
    return { x: 0.5, y: 0.5 };
  }

  const pageTransform = editor.getShapePageTransform(targetShape);
  const geometryInPage = targetShapeGeometry.transform(pageTransform);

  const anchorPoint = geometryInPage.hitTestPoint(targetPoint, 0, true)
    ? targetPoint
    : geometryInPage.nearestPoint(targetPoint);

  const normalizedAnchor = {
    x: (anchorPoint.x - targetShapePageBounds.x) / targetShapePageBounds.w,
    y: (anchorPoint.y - targetShapePageBounds.y) / targetShapePageBounds.h,
  };

  const clamped = {
    x: Math.max(0.1, Math.min(0.9, normalizedAnchor.x)),
    y: Math.max(0.1, Math.min(0.9, normalizedAnchor.y)),
  };

  const clampedInPage = {
    x: targetShapePageBounds.x + clamped.x * targetShapePageBounds.w,
    y: targetShapePageBounds.y + clamped.y * targetShapePageBounds.h,
  };

  return geometryInPage.hitTestPoint(clampedInPage, 0, true)
    ? clamped
    : { x: 0.5, y: 0.5 };
}

export function bindingPointForShape(
  editor: Editor,
  shapeId: TLShapeId,
  toward?: VecLike,
): VecLike | null {
  const shape = editor.getShape(shapeId);
  const bounds = shape ? editor.getShapePageBounds(shape) : null;
  if (!shape || !bounds) return null;
  if (toward) {
    const geometry = editor.getShapeGeometry(shape);
    const pageTransform = editor.getShapePageTransform(shape);
    const geometryInPage = geometry.transform(pageTransform);
    return geometryInPage.nearestPoint(toward);
  }
  return { x: bounds.midX, y: bounds.midY };
}

export function buildArrowBindings(
  editor: Editor,
  arrowId: TLShapeId,
  opts: {
    fromId?: TLShapeId;
    toId?: TLShapeId;
    startPage: VecLike;
    endPage: VecLike;
  },
): TLBindingCreate[] {
  const bindings: TLBindingCreate[] = [];

  if (opts.fromId) {
    const startShape = editor.getShape(opts.fromId);
    if (startShape) {
      bindings.push({
        id: createBindingId(),
        type: "arrow",
        fromId: arrowId,
        toId: startShape.id,
        props: {
          normalizedAnchor: calculateArrowBindingAnchor(editor, startShape, opts.startPage),
          isExact: false,
          isPrecise: true,
          terminal: "start",
        },
        meta: {},
      });
    }
  }

  if (opts.toId) {
    const endShape = editor.getShape(opts.toId);
    if (endShape) {
      bindings.push({
        id: createBindingId(),
        type: "arrow",
        fromId: arrowId,
        toId: endShape.id,
        props: {
          normalizedAnchor: calculateArrowBindingAnchor(editor, endShape, opts.endPage),
          isExact: false,
          isPrecise: true,
          terminal: "end",
        },
        meta: {},
      });
    }
  }

  return bindings;
}

export function resolveArrowEndpoints(
  editor: Editor,
  args: {
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    fromId?: TLShapeId;
    toId?: TLShapeId;
  },
): { x1: number; y1: number; x2: number; y2: number; fromId?: TLShapeId; toId?: TLShapeId } {
  const fromId = args.fromId;
  const toId = args.toId;

  let x1 = args.x1;
  let y1 = args.y1;
  let x2 = args.x2;
  let y2 = args.y2;

  if (fromId) {
    const toward =
      x2 !== undefined && y2 !== undefined ? { x: x2, y: y2 } : undefined;
    const pt = bindingPointForShape(editor, fromId, toward);
    if (pt) {
      x1 = pt.x;
      y1 = pt.y;
    }
  }
  if (toId) {
    const toward =
      x1 !== undefined && y1 !== undefined ? { x: x1, y: y1 } : undefined;
    const pt = bindingPointForShape(editor, toId, toward);
    if (pt) {
      x2 = pt.x;
      y2 = pt.y;
    }
  }

  if (
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined
  ) {
    throw new Error(
      "create_arrow requires x1,y1,x2,y2 or from_id/to_id with resolvable shape bounds",
    );
  }

  return { x1, y1, x2, y2, fromId, toId };
}

export function createArrowShapeWithBindings(
  editor: Editor,
  input: {
    id?: TLShapeId;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    fromId?: TLShapeId;
    toId?: TLShapeId;
    props?: Record<string, unknown>;
  },
): TLShapeId {
  const id = input.id ?? createShapeId();
  const minX = Math.min(input.x1, input.x2);
  const minY = Math.min(input.y1, input.y2);
  const props = {
    start: { x: input.x1 - minX, y: input.y1 - minY },
    end: { x: input.x2 - minX, y: input.y2 - minY },
    ...input.props,
  };

  editor.createShape({ id, type: "arrow", x: minX, y: minY, props });

  const bindings = buildArrowBindings(editor, id, {
    fromId: input.fromId,
    toId: input.toId,
    startPage: { x: input.x1, y: input.y1 },
    endPage: { x: input.x2, y: input.y2 },
  });
  if (bindings.length) {
    editor.createBindings(bindings);
  }

  return id;
}
