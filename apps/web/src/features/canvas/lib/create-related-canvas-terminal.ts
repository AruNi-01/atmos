"use client";

import { createTranslator } from "next-intl";
import {
  createShapeId,
  type Editor,
  type TLShapeId,
} from "tldraw";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import type { Project } from "@/shared/types/domain";
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import type { TerminalCenterTab } from "@/features/terminal/store/use-terminal-store";
import {
  buildCanvasTerminalPinKey,
  CANVAS_TERMINAL_SHAPE_TYPE,
  createCanvasTerminalShapeProps,
  isCanvasTerminalShapeRecord,
  type CanvasTerminalShapeProps,
  type CanvasTerminalShape,
} from "./canvas-terminal-shape";

type CanvasTerminalPageBounds = NonNullable<ReturnType<Editor["getShapePageBounds"]>>;
type RelatedCanvasShape = ReturnType<Editor["getCurrentPageShapes"]>[number];

export type RelatedCanvasTerminalSourceShape = Pick<RelatedCanvasShape, "id" | "parentId"> & {
  props?: Partial<CanvasTerminalShapeProps>;
};

export type RelatedCanvasTerminalSourceContext = Pick<
  CanvasTerminalShapeProps,
  "contextScope" | "workspaceId" | "projectName" | "workspaceName" | "localPath"
>;

type PlacementRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RelatedCanvasTerminalEditor = Pick<
  Editor,
  "createShape" | "getCurrentPageShapes" | "getShape" | "getShapePageBounds" | "reparentShapes" | "updateShape"
>;

export type CreatedTerminalTabWithPane = {
  tab: TerminalCenterTab;
  paneId: string;
  pane: TerminalPaneProps;
};

export type RelatedCanvasTerminalResult = {
  newShapeId: TLShapeId;
  pinKey: string;
  terminalTabId: string;
  tmuxWindowName: string;
};

let cachedRelatedCanvasTerminalLocale: "en" | "zh" | null = null;
let cachedRelatedCanvasTerminalTranslator: ReturnType<typeof createTranslator> | null = null;

function relatedCanvasTerminalT(key: string): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedRelatedCanvasTerminalTranslator || cachedRelatedCanvasTerminalLocale !== locale) {
    cachedRelatedCanvasTerminalLocale = locale;
    cachedRelatedCanvasTerminalTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "canvas.relatedTerminal",
    });
  }
  return cachedRelatedCanvasTerminalTranslator(key as never);
}

function toRelatedCanvasTerminalSourceContext(
  source: RelatedCanvasTerminalSourceContext | RelatedCanvasTerminalSourceShape | null | undefined,
): RelatedCanvasTerminalSourceContext | null {
  const candidate =
    source && "contextScope" in source
      ? source
      : source && "props" in source
        ? source.props
        : null;

  if (!candidate) {
    return null;
  }

  const { contextScope, workspaceId, projectName, workspaceName, localPath } = candidate;
  if (
    (contextScope !== "project" && contextScope !== "workspace") ||
    typeof workspaceId !== "string" ||
    typeof projectName !== "string" ||
    typeof workspaceName !== "string" ||
    typeof localPath !== "string"
  ) {
    return null;
  }

  return {
    contextScope,
    workspaceId,
    projectName,
    workspaceName,
    localPath,
  };
}

export function resolveRelatedCanvasTerminalFrameName(
  projects: Project[],
  source: RelatedCanvasTerminalSourceContext | RelatedCanvasTerminalSourceShape,
) {
  const sourceContext = toRelatedCanvasTerminalSourceContext(source);
  if (!sourceContext) {
    return relatedCanvasTerminalT("fallback.workspace");
  }

  for (const project of projects) {
    if (sourceContext.contextScope === "project" && project.id === sourceContext.workspaceId) {
      return project.name || sourceContext.projectName || relatedCanvasTerminalT("fallback.project");
    }

    const workspace = project.workspaces.find((candidate) => candidate.id === sourceContext.workspaceId);
    if (workspace) {
      return (
        workspace.displayName ||
        workspace.name ||
        sourceContext.workspaceName ||
        project.name ||
        relatedCanvasTerminalT("fallback.workspace")
      );
    }
  }

  return sourceContext.contextScope === "project"
    ? sourceContext.projectName || relatedCanvasTerminalT("fallback.project")
    : sourceContext.workspaceName || sourceContext.projectName || relatedCanvasTerminalT("fallback.workspace");
}

const RELATED_TERMINAL_GAP = 32;

function rectsOverlap(a: PlacementRect, b: PlacementRect, gap: number): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function hasVerticalOverlap(a: PlacementRect, b: PlacementRect, gap: number): boolean {
  return !(a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);
}

function toPlacementRect(bounds: CanvasTerminalPageBounds): PlacementRect {
  return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
}

function getRelatedTerminalSlotCandidates(
  current: CanvasTerminalPageBounds,
  terminalSize: Pick<CanvasTerminalShapeProps, "w" | "h">,
): PlacementRect[] {
  const { w, h } = terminalSize;
  const gap = RELATED_TERMINAL_GAP;
  return [
    { x: current.maxX + gap, y: current.y, w, h },
    { x: current.x - w - gap, y: current.y, w, h },
    { x: current.x, y: current.maxY + gap, w, h },
    { x: current.x, y: current.y - h - gap, w, h },
  ];
}

function collectOccupiedRects(
  editor: RelatedCanvasTerminalEditor,
  currentShape: RelatedCanvasTerminalSourceShape,
): PlacementRect[] {
  const parentShapeId = String(currentShape.parentId).startsWith("shape:")
    ? String(currentShape.parentId)
    : null;
  const rects: PlacementRect[] = [];

  for (const candidate of editor.getCurrentPageShapes()) {
    if (parentShapeId && String(candidate.id) === parentShapeId) {
      continue;
    }
    const bounds = editor.getShapePageBounds(candidate.id as TLShapeId);
    if (!bounds) {
      continue;
    }
    rects.push(toPlacementRect(bounds));
  }

  return rects;
}

function findFreeAdjacentSlot(
  slots: PlacementRect[],
  occupied: PlacementRect[],
  expandableFrameBounds: CanvasTerminalPageBounds | null,
): PlacementRect | null {
  const candidates = expandableFrameBounds
    ? slots.filter((slot) => slot.x >= expandableFrameBounds.x && slot.y >= expandableFrameBounds.y)
    : slots;

  for (const slot of candidates) {
    if (!occupied.some((rect) => rectsOverlap(slot, rect, RELATED_TERMINAL_GAP))) {
      return slot;
    }
  }
  return null;
}

function getExpandableParentFrameBounds(
  editor: RelatedCanvasTerminalEditor,
  currentShape: RelatedCanvasTerminalSourceShape,
): CanvasTerminalPageBounds | null {
  if (!String(currentShape.parentId).startsWith("shape:")) {
    return null;
  }

  const parentShape = editor.getShape(currentShape.parentId as TLShapeId);
  if (parentShape?.type !== "frame") {
    return null;
  }

  return editor.getShapePageBounds(parentShape.id as TLShapeId) ?? null;
}

function shiftRightSideTerminalShapes(
  editor: RelatedCanvasTerminalEditor,
  currentShape: RelatedCanvasTerminalSourceShape,
  rightSlot: PlacementRect,
): TLShapeId[] {
  const terminals = editor.getCurrentPageShapes()
    .filter((candidate): candidate is RelatedCanvasShape & CanvasTerminalShape =>
      candidate.id !== currentShape.id &&
      candidate.parentId === currentShape.parentId &&
      isCanvasTerminalShapeRecord(candidate),
    )
    .map((candidate) => {
      const bounds = editor.getShapePageBounds(candidate.id as TLShapeId);
      return bounds ? { shape: candidate, rect: toPlacementRect(bounds) } : null;
    })
    .filter((candidate): candidate is { shape: RelatedCanvasShape & CanvasTerminalShape; rect: PlacementRect } =>
      Boolean(candidate),
    )
    .filter(({ rect }) => rect.x >= rightSlot.x - RELATED_TERMINAL_GAP && hasVerticalOverlap(rect, rightSlot, RELATED_TERMINAL_GAP));

  if (terminals.length === 0) {
    return [];
  }

  const leftMostX = Math.min(...terminals.map(({ rect }) => rect.x));
  const shiftX = rightSlot.x + rightSlot.w + RELATED_TERMINAL_GAP - leftMostX;
  if (shiftX <= 0) {
    return [];
  }

  const shiftedShapeIds: TLShapeId[] = [];
  for (const { shape } of terminals) {
    editor.updateShape({
      id: shape.id as TLShapeId,
      type: CANVAS_TERMINAL_SHAPE_TYPE,
      x: shape.x + shiftX,
    });
    shiftedShapeIds.push(shape.id as TLShapeId);
  }

  return shiftedShapeIds;
}

function findRelatedCanvasTerminalPlacement(
  editor: RelatedCanvasTerminalEditor,
  currentShape: RelatedCanvasTerminalSourceShape,
  currentBounds: CanvasTerminalPageBounds,
  terminalSize: Pick<CanvasTerminalShapeProps, "w" | "h">,
): { x: number; y: number; shiftedShapeIds: TLShapeId[] } {
  const slots = getRelatedTerminalSlotCandidates(currentBounds, terminalSize);
  const freeSlot = findFreeAdjacentSlot(
    slots,
    collectOccupiedRects(editor, currentShape),
    getExpandableParentFrameBounds(editor, currentShape),
  );
  if (freeSlot) {
    return { x: freeSlot.x, y: freeSlot.y, shiftedShapeIds: [] };
  }

  const rightSlot = slots[0];
  return {
    x: rightSlot.x,
    y: rightSlot.y,
    shiftedShapeIds: shiftRightSideTerminalShapes(editor, currentShape, rightSlot),
  };
}

export function createRelatedCanvasTerminalShape({
  editor,
  shape,
  created,
  frameName,
  sourceContext,
  currentBounds,
  createId = createShapeId,
}: {
  editor: RelatedCanvasTerminalEditor;
  shape: RelatedCanvasTerminalSourceShape;
  created: CreatedTerminalTabWithPane;
  frameName: string;
  sourceContext?: RelatedCanvasTerminalSourceContext;
  currentBounds?: CanvasTerminalPageBounds | null;
  createId?: () => TLShapeId;
}): RelatedCanvasTerminalResult | null {
  const bounds = currentBounds ?? editor.getShapePageBounds(shape.id as TLShapeId);
  if (!bounds) {
    return null;
  }

  const nextTmuxWindowName = created.pane.tmuxWindowName;
  if (!nextTmuxWindowName) {
    return null;
  }

  const newShapeId = createId();
  const resolvedSourceContext = toRelatedCanvasTerminalSourceContext(sourceContext ?? shape);
  if (!resolvedSourceContext) {
    return null;
  }

  const contextScope = resolvedSourceContext.contextScope;
  const pinKey = buildCanvasTerminalPinKey(
    contextScope,
    resolvedSourceContext.workspaceId,
    nextTmuxWindowName,
  );
  const nextProps = createCanvasTerminalShapeProps({
    contextScope,
    workspaceId: resolvedSourceContext.workspaceId,
    projectName: resolvedSourceContext.projectName,
    workspaceName: resolvedSourceContext.workspaceName,
    localPath: resolvedSourceContext.localPath,
    terminalName: created.pane.label,
    tmuxWindowName: nextTmuxWindowName,
    paneAgent: created.pane.agent,
    sourceTerminalTabId: created.tab.id,
    isNewTerminal: true,
    isPinned: true,
    pinKey,
  });
  const placement = findRelatedCanvasTerminalPlacement(editor, shape, bounds, nextProps);

  editor.createShape<CanvasTerminalShape>({
    id: newShapeId,
    type: CANVAS_TERMINAL_SHAPE_TYPE,
    x: placement.x,
    y: placement.y,
    props: nextProps,
  });

  const parentShape = String(shape.parentId).startsWith("shape:")
    ? editor.getShape(shape.parentId as TLShapeId)
    : null;

  if (parentShape?.type === "frame") {
    const newBounds = editor.getShapePageBounds(newShapeId);
    const frameBounds = editor.getShapePageBounds(parentShape.id as TLShapeId);
    if (newBounds && frameBounds) {
      const frameProps = parentShape.props as { w?: number; h?: number };
      const shiftedBounds = placement.shiftedShapeIds
        .map((id) => editor.getShapePageBounds(id))
        .filter((candidate): candidate is CanvasTerminalPageBounds => Boolean(candidate));
      const nextContentRight = Math.max(newBounds.maxX, ...shiftedBounds.map((candidate) => candidate.maxX));
      const nextContentBottom = Math.max(newBounds.maxY, ...shiftedBounds.map((candidate) => candidate.maxY));
      const nextFrameW = Math.max(frameProps.w ?? frameBounds.w, nextContentRight - frameBounds.x + 24);
      const nextFrameH = Math.max(frameProps.h ?? frameBounds.h, nextContentBottom - frameBounds.y + 24);
      if (nextFrameW !== frameProps.w || nextFrameH !== frameProps.h) {
        editor.updateShape({
          id: parentShape.id as TLShapeId,
          type: "frame",
          props: {
            w: nextFrameW,
            h: nextFrameH,
          },
        });
      }
    }
    editor.reparentShapes([newShapeId], parentShape.id as TLShapeId);
  } else {
    const newBounds = editor.getShapePageBounds(newShapeId);
    const contentLeft = Math.min(bounds.x, newBounds?.x ?? bounds.x);
    const contentTop = Math.min(bounds.y, newBounds?.y ?? bounds.y);
    const contentRight = Math.max(bounds.maxX, newBounds?.maxX ?? bounds.maxX);
    const contentBottom = Math.max(bounds.maxY, newBounds?.maxY ?? bounds.maxY);
    const frameX = contentLeft - 24;
    const frameY = contentTop - 56;
    const frameRight = contentRight + 24;
    const frameBottom = contentBottom + 24;
    const frameId = createId();

    editor.createShape({
      id: frameId,
      type: "frame",
      x: frameX,
      y: frameY,
      props: {
        w: Math.max(640, frameRight - frameX),
        h: Math.max(440, frameBottom - frameY),
        name: frameName,
      },
    });
    editor.reparentShapes([shape.id as TLShapeId, newShapeId], frameId);
  }

  return {
    newShapeId,
    pinKey,
    terminalTabId: created.tab.id,
    tmuxWindowName: nextTmuxWindowName,
  };
}
