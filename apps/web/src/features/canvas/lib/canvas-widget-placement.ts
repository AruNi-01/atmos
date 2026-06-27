import type { Editor, TLShape, TLShapeId } from "tldraw";

const DEFAULT_GAP = 32;
const FRAME_CONTENT_X = 24;
const FRAME_CONTENT_Y = 56;
const SEARCH_STEP = 96;
const MAX_SEARCH_RADIUS = 1800;

type PlacementRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type LayoutPlan = {
  w: number;
  h: number;
  offsets: Array<{ x: number; y: number }>;
};

function getShapeFallbackSize(shape: TLShape): { w: number; h: number } {
  const props = shape.props as { w?: unknown; h?: unknown };
  const w = typeof props.w === "number" && props.w > 0 ? props.w : 160;
  const h = typeof props.h === "number" && props.h > 0 ? props.h : 80;
  return { w, h };
}

function getShapeRect(editor: Editor, shape: TLShape): PlacementRect {
  const bounds = editor.getShapePageBounds(shape.id as TLShapeId);
  if (bounds) {
    return {
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
    };
  }

  const fallback = getShapeFallbackSize(shape);
  return {
    x: shape.x,
    y: shape.y,
    w: fallback.w,
    h: fallback.h,
  };
}

function collectOccupiedRects(
  editor: Editor,
  options?: {
    frameId?: TLShapeId | null;
  },
): PlacementRect[] {
  return editor
    .getCurrentPageShapes()
    .filter((shape) => shape.id !== options?.frameId)
    .map((shape) => getShapeRect(editor, shape));
}

function rectsOverlap(a: PlacementRect, b: PlacementRect, gap: number): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function layoutRects(origin: { x: number; y: number }, layout: LayoutPlan, sizes: Array<{ w: number; h: number }>) {
  return sizes.map((size, index) => ({
    x: origin.x + layout.offsets[index]!.x,
    y: origin.y + layout.offsets[index]!.y,
    w: size.w,
    h: size.h,
  }));
}

function fitsLayout(
  origin: { x: number; y: number },
  layout: LayoutPlan,
  sizes: Array<{ w: number; h: number }>,
  occupied: PlacementRect[],
): boolean {
  return layoutRects(origin, layout, sizes).every(
    (candidate) => !occupied.some((rect) => rectsOverlap(candidate, rect, DEFAULT_GAP)),
  );
}

function createLayoutPlan(sizes: Array<{ w: number; h: number }>): LayoutPlan {
  if (sizes.length === 1) {
    return {
      w: sizes[0]!.w,
      h: sizes[0]!.h,
      offsets: [{ x: 0, y: 0 }],
    };
  }

  const columns = 2;
  const columnWidths = Array.from({ length: columns }, () => 0);
  const rowCount = Math.ceil(sizes.length / columns);
  const rowHeights = Array.from({ length: rowCount }, () => 0);

  sizes.forEach((size, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    columnWidths[column] = Math.max(columnWidths[column], size.w);
    rowHeights[row] = Math.max(rowHeights[row], size.h);
  });

  const columnOffsets = columnWidths.map((_, index) =>
    columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0) + DEFAULT_GAP * index,
  );
  const rowOffsets = rowHeights.map((_, index) =>
    rowHeights.slice(0, index).reduce((sum, height) => sum + height, 0) + DEFAULT_GAP * index,
  );

  return {
    w: columnWidths.reduce((sum, width) => sum + width, 0) + DEFAULT_GAP,
    h:
      rowHeights.reduce((sum, height) => sum + height, 0) +
      DEFAULT_GAP * Math.max(0, rowHeights.length - 1),
    offsets: sizes.map((_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        x: columnOffsets[column]!,
        y: rowOffsets[row]!,
      };
    }),
  };
}

function rawCanvasWidgetPlacement(
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
      const sourceRect = getShapeRect(editor, source);
      return {
        x: sourceRect.x + sourceRect.w + DEFAULT_GAP,
        y: sourceRect.y,
      };
    }
  }

  if (options?.frameId) {
    const frame = editor.getShape(options.frameId);
    if (frame?.type === "frame") {
      const frameRect = getShapeRect(editor, frame);
      return {
        x: frameRect.x + FRAME_CONTENT_X,
        y: frameRect.y + FRAME_CONTENT_Y,
      };
    }
  }

  const viewportCenter = editor.getViewportPageBounds().center;
  return {
    x: viewportCenter.x - size.w / 2,
    y: viewportCenter.y - size.h / 2,
  };
}

function unionBounds(rects: PlacementRect[]): PlacementRect | null {
  if (rects.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

function squaredDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function uniquePositions(positions: Array<{ x: number; y: number }>) {
  const seen = new Set<string>();
  const unique: Array<{ x: number; y: number }> = [];
  for (const position of positions) {
    const key = `${Math.round(position.x * 1000) / 1000}:${Math.round(position.y * 1000) / 1000}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(position);
  }
  return unique;
}

function sortByDistanceTo(
  origin: { x: number; y: number },
  positions: Array<{ x: number; y: number }>,
) {
  return positions.sort((left, right) => {
    const distanceDelta = squaredDistance(left, origin) - squaredDistance(right, origin);
    if (distanceDelta !== 0) {
      return distanceDelta;
    }
    if (left.y !== right.y) {
      return left.y - right.y;
    }
    return left.x - right.x;
  });
}

function getCandidateOrigins(origin: { x: number; y: number }, layout: LayoutPlan, occupied: PlacementRect[]) {
  const right: Array<{ x: number; y: number }> = [];
  const below: Array<{ x: number; y: number }> = [];
  const left: Array<{ x: number; y: number }> = [];
  const above: Array<{ x: number; y: number }> = [];
  const spiral: Array<{ x: number; y: number }> = [];

  for (const rect of occupied) {
    right.push(
      { x: rect.x + rect.w + DEFAULT_GAP, y: origin.y },
      { x: rect.x + rect.w + DEFAULT_GAP, y: rect.y },
      { x: rect.x + rect.w + DEFAULT_GAP, y: rect.y + rect.h - layout.h },
    );
    left.push(
      { x: rect.x - layout.w - DEFAULT_GAP, y: origin.y },
      { x: rect.x - layout.w - DEFAULT_GAP, y: rect.y },
      { x: rect.x - layout.w - DEFAULT_GAP, y: rect.y + rect.h - layout.h },
    );
    below.push(
      { x: origin.x, y: rect.y + rect.h + DEFAULT_GAP },
      { x: rect.x, y: rect.y + rect.h + DEFAULT_GAP },
      { x: rect.x + rect.w - layout.w, y: rect.y + rect.h + DEFAULT_GAP },
    );
    above.push(
      { x: origin.x, y: rect.y - layout.h - DEFAULT_GAP },
      { x: rect.x, y: rect.y - layout.h - DEFAULT_GAP },
      { x: rect.x + rect.w - layout.w, y: rect.y - layout.h - DEFAULT_GAP },
    );
  }

  for (let ring = 1; ring * SEARCH_STEP <= MAX_SEARCH_RADIUS; ring += 1) {
    const d = ring * SEARCH_STEP;
    spiral.push(
      { x: origin.x + d, y: origin.y },
      { x: origin.x - d, y: origin.y },
      { x: origin.x, y: origin.y + d },
      { x: origin.x, y: origin.y - d },
      { x: origin.x + d, y: origin.y + d },
      { x: origin.x - d, y: origin.y + d },
      { x: origin.x + d, y: origin.y - d },
      { x: origin.x - d, y: origin.y - d },
    );
  }

  return uniquePositions([
    origin,
    ...sortByDistanceTo(origin, right),
    ...sortByDistanceTo(origin, below),
    ...sortByDistanceTo(origin, left),
    ...sortByDistanceTo(origin, above),
    ...spiral,
  ]);
}

function getFrameContentBounds(editor: Editor, frameId?: TLShapeId | null): PlacementRect | null {
  if (!frameId) {
    return null;
  }
  const frame = editor.getShape(frameId);
  if (frame?.type !== "frame") {
    return null;
  }
  const frameRect = getShapeRect(editor, frame);
  return {
    x: frameRect.x + FRAME_CONTENT_X,
    y: frameRect.y + FRAME_CONTENT_Y,
    w: Math.max(0, frameRect.w - FRAME_CONTENT_X * 2),
    h: Math.max(0, frameRect.h - FRAME_CONTENT_Y - FRAME_CONTENT_X),
  };
}

function layoutFitsWithin(origin: { x: number; y: number }, layout: LayoutPlan, bounds: PlacementRect): boolean {
  return (
    origin.x >= bounds.x &&
    origin.y >= bounds.y &&
    origin.x + layout.w <= bounds.x + bounds.w &&
    origin.y + layout.h <= bounds.y + bounds.h
  );
}

function findFreeLayoutOrigin(
  editor: Editor,
  sizes: Array<{ w: number; h: number }>,
  options?: {
    frameId?: TLShapeId | null;
    sourceShapeId?: TLShapeId | null;
  },
): { x: number; y: number } {
  const layout = createLayoutPlan(sizes);
  const firstPlacement = rawCanvasWidgetPlacement(editor, sizes[0]!, options);
  const anchorIsTopLeft = Boolean(options?.frameId || options?.sourceShapeId);
  const rawOrigin = anchorIsTopLeft
    ? firstPlacement
    : {
        x: firstPlacement.x + sizes[0]!.w / 2 - layout.w / 2,
        y: firstPlacement.y + sizes[0]!.h / 2 - layout.h / 2,
      };
  const occupied = collectOccupiedRects(editor, { frameId: options?.frameId });
  const frameContentBounds = getFrameContentBounds(editor, options?.frameId);
  const candidates = getCandidateOrigins(rawOrigin, layout, occupied);

  if (frameContentBounds) {
    for (const origin of candidates) {
      if (
        layoutFitsWithin(origin, layout, frameContentBounds) &&
        fitsLayout(origin, layout, sizes, occupied)
      ) {
        return origin;
      }
    }
  }

  for (const origin of candidates) {
    if (fitsLayout(origin, layout, sizes, occupied)) {
      return origin;
    }
  }

  const occupiedBounds = unionBounds(occupied);
  return occupiedBounds
    ? {
        x: occupiedBounds.x + occupiedBounds.w + DEFAULT_GAP,
        y: occupiedBounds.y,
      }
    : rawOrigin;
}

export function findCanvasWidgetPlacement(
  editor: Editor,
  size: { w: number; h: number },
  options?: {
    frameId?: TLShapeId | null;
    sourceShapeId?: TLShapeId | null;
  },
): { x: number; y: number } {
  return findFreeLayoutOrigin(editor, [size], options);
}

export function findCanvasWidgetPlacements(
  editor: Editor,
  sizes: Array<{ w: number; h: number }>,
  options?: {
    frameId?: TLShapeId | null;
    sourceShapeId?: TLShapeId | null;
  },
): Array<{ x: number; y: number }> {
  if (sizes.length === 0) {
    return [];
  }

  const layout = createLayoutPlan(sizes);
  const origin = findFreeLayoutOrigin(editor, sizes, options);

  return sizes.map((_, index) => {
    const offset = layout.offsets[index]!;
    return {
      x: origin.x + offset.x,
      y: origin.y + offset.y,
    };
  });
}
