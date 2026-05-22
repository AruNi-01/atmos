import type { Editor, TLShape } from "tldraw";

import { getShapePageBoundsBox, moveShapeBoundsTo } from "./canvas-agent-bounds";
import { CanvasAgentError } from "./canvas-agent-errors";

export type AlignMode =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center-horizontal"
  | "center-vertical";

export type StackDirection = "horizontal" | "vertical";

export type DistributeDirection = "horizontal" | "vertical";

export type PlaceSide = "top" | "bottom" | "left" | "right";
export type PlaceAlign = "start" | "center" | "end";

const ALIGN_MODES = new Set<AlignMode>([
  "top",
  "bottom",
  "left",
  "right",
  "center-horizontal",
  "center-vertical",
]);

export function parseAlignMode(value: unknown): AlignMode {
  const s = String(value ?? "").trim();
  if (ALIGN_MODES.has(s as AlignMode)) return s as AlignMode;
  throw new CanvasAgentError(
    "VALIDATION_ARG",
    `alignment must be one of: ${[...ALIGN_MODES].join(", ")}`,
    false,
  );
}

export function parseStackDirection(value: unknown): StackDirection {
  const s = String(value ?? "").trim();
  if (s === "horizontal" || s === "vertical") return s;
  throw new CanvasAgentError(
    "VALIDATION_ARG",
    "direction must be horizontal or vertical",
    false,
  );
}

export function parseDistributeDirection(value: unknown): DistributeDirection {
  return parseStackDirection(value);
}

export function parsePlaceSide(value: unknown): PlaceSide {
  const s = String(value ?? "").trim();
  if (s === "top" || s === "bottom" || s === "left" || s === "right") return s;
  throw new CanvasAgentError(
    "VALIDATION_ARG",
    "side must be top, bottom, left, or right",
    false,
  );
}

export function parsePlaceAlign(value: unknown): PlaceAlign {
  const s = String(value ?? "center").trim();
  if (s === "start" || s === "center" || s === "end") return s;
  throw new CanvasAgentError(
    "VALIDATION_ARG",
    "align must be start, center, or end",
    false,
  );
}

export function runAlign(editor: Editor, shapes: TLShape[], alignment: AlignMode): void {
  editor.alignShapes(
    shapes.map((s) => s.id),
    alignment,
  );
}

export function runStack(
  editor: Editor,
  shapes: TLShape[],
  direction: StackDirection,
  gap: number,
): void {
  editor.stackShapes(
    shapes.map((s) => s.id),
    direction,
    gap,
  );
}

export function runDistribute(
  editor: Editor,
  shapes: TLShape[],
  direction: DistributeDirection,
): void {
  editor.distributeShapes(
    shapes.map((s) => s.id),
    direction,
  );
}

export function runPlace(
  editor: Editor,
  shape: TLShape,
  reference: TLShape,
  side: PlaceSide,
  align: PlaceAlign,
  sideOffset: number,
  alignOffset: number,
): void {
  const bbA = getShapePageBoundsBox(editor, shape.id);
  const bbR = getShapePageBoundsBox(editor, reference.id);
  if (!bbA || !bbR) {
    throw new CanvasAgentError(
      "VALIDATION_ARG",
      "place requires shapes with measurable page bounds",
      true,
    );
  }

  let minX = bbA.minX;
  let minY = bbA.minY;

  if (side === "top" && align === "start") {
    minX = bbR.minX + alignOffset;
    minY = bbR.minY - bbA.height - sideOffset;
  } else if (side === "top" && align === "center") {
    minX = bbR.midX - bbA.width / 2 + alignOffset;
    minY = bbR.minY - bbA.height - sideOffset;
  } else if (side === "top" && align === "end") {
    minX = bbR.maxX - bbA.width - alignOffset;
    minY = bbR.minY - bbA.height - sideOffset;
  } else if (side === "bottom" && align === "start") {
    minX = bbR.minX + alignOffset;
    minY = bbR.maxY + sideOffset;
  } else if (side === "bottom" && align === "center") {
    minX = bbR.midX - bbA.width / 2 + alignOffset;
    minY = bbR.maxY + sideOffset;
  } else if (side === "bottom" && align === "end") {
    minX = bbR.maxX - bbA.width - alignOffset;
    minY = bbR.maxY + sideOffset;
  } else if (side === "left" && align === "start") {
    minX = bbR.minX - bbA.width - sideOffset;
    minY = bbR.minY + alignOffset;
  } else if (side === "left" && align === "center") {
    minX = bbR.minX - bbA.width - sideOffset;
    minY = bbR.midY - bbA.height / 2 + alignOffset;
  } else if (side === "left" && align === "end") {
    minX = bbR.minX - bbA.width - sideOffset;
    minY = bbR.maxY - bbA.height - alignOffset;
  } else if (side === "right" && align === "start") {
    minX = bbR.maxX + sideOffset;
    minY = bbR.minY + alignOffset;
  } else if (side === "right" && align === "center") {
    minX = bbR.maxX + sideOffset;
    minY = bbR.midY - bbA.height / 2 + alignOffset;
  } else if (side === "right" && align === "end") {
    minX = bbR.maxX + sideOffset;
    minY = bbR.maxY - bbA.height - alignOffset;
  }

  moveShapeBoundsTo(editor, shape, minX, minY);
}

export function layoutRowByBounds(
  editor: Editor,
  shapes: TLShape[],
  gap: number,
  yPin?: number,
): void {
  if (!shapes.length) return;
  const firstBb = getShapePageBoundsBox(editor, shapes[0]!.id);
  if (!firstBb) return;
  const baseY = yPin ?? firstBb.minY;
  let cursorMaxX = firstBb.maxX;

  moveShapeBoundsTo(editor, shapes[0]!, firstBb.minX, baseY);

  for (let idx = 1; idx < shapes.length; idx++) {
    const shape = shapes[idx]!;
    const bb = getShapePageBoundsBox(editor, shape.id);
    if (!bb) continue;
    const targetMinX = cursorMaxX + gap;
    moveShapeBoundsTo(editor, shape, targetMinX, baseY);
    const after = getShapePageBoundsBox(editor, shape.id);
    cursorMaxX = after?.maxX ?? targetMinX + bb.width;
  }
}

export function layoutColumnByBounds(
  editor: Editor,
  shapes: TLShape[],
  gap: number,
  xPin?: number,
): void {
  if (!shapes.length) return;
  const firstBb = getShapePageBoundsBox(editor, shapes[0]!.id);
  if (!firstBb) return;
  const baseX = xPin ?? firstBb.minX;
  let cursorMaxY = firstBb.maxY;

  moveShapeBoundsTo(editor, shapes[0]!, baseX, firstBb.minY);

  for (let idx = 1; idx < shapes.length; idx++) {
    const shape = shapes[idx]!;
    const bb = getShapePageBoundsBox(editor, shape.id);
    if (!bb) continue;
    const targetMinY = cursorMaxY + gap;
    moveShapeBoundsTo(editor, shape, baseX, targetMinY);
    const after = getShapePageBoundsBox(editor, shape.id);
    cursorMaxY = after?.maxY ?? targetMinY + bb.height;
  }
}

export function layoutGridByBounds(
  editor: Editor,
  shapes: TLShape[],
  cols: number,
  rows: number,
  gap: number,
): void {
  if (!shapes.length) return;
  const firstBb = getShapePageBoundsBox(editor, shapes[0]!.id);
  if (!firstBb) return;

  const colWidths = Array.from({ length: cols }, () => 0);
  const rowHeights = Array.from({ length: rows }, () => 0);

  for (let idx = 0; idx < shapes.length; idx++) {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const bb = getShapePageBoundsBox(editor, shapes[idx]!.id);
    if (!bb) continue;
    colWidths[col] = Math.max(colWidths[col]!, bb.width);
    rowHeights[row] = Math.max(rowHeights[row]!, bb.height);
  }

  let baseY = firstBb.minY;
  for (let row = 0; row < rows; row++) {
    let baseX = firstBb.minX;
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      if (idx >= shapes.length) return;
      const shape = shapes[idx]!;
      moveShapeBoundsTo(editor, shape, baseX, baseY);
      baseX += (colWidths[col] ?? 0) + gap;
    }
    baseY += (rowHeights[row] ?? 0) + gap;
  }
}
