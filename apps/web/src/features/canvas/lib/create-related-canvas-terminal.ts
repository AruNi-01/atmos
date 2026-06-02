"use client";

import {
  createShapeId,
  type Editor,
  type TLShapeId,
} from "tldraw";
import type { Project } from "@/shared/types/domain";
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import type { TerminalCenterTab } from "@/features/terminal/store/use-terminal-store";
import {
  buildCanvasTerminalPinKey,
  CANVAS_TERMINAL_SHAPE_TYPE,
  createCanvasTerminalShapeProps,
  type CanvasTerminalShape,
} from "./canvas-terminal-shape";

type CanvasTerminalPageBounds = NonNullable<ReturnType<Editor["getShapePageBounds"]>>;

export type RelatedCanvasTerminalEditor = Pick<
  Editor,
  "createShape" | "getShape" | "getShapePageBounds" | "reparentShapes" | "updateShape"
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

export function resolveRelatedCanvasTerminalFrameName(
  projects: Project[],
  shape: CanvasTerminalShape,
) {
  for (const project of projects) {
    if (shape.props.contextScope === "project" && project.id === shape.props.workspaceId) {
      return project.name || shape.props.projectName || "Project";
    }

    const workspace = project.workspaces.find((candidate) => candidate.id === shape.props.workspaceId);
    if (workspace) {
      return workspace.displayName || workspace.name || shape.props.workspaceName || project.name || "Workspace";
    }
  }

  return shape.props.contextScope === "project"
    ? shape.props.projectName || "Project"
    : shape.props.workspaceName || shape.props.projectName || "Workspace";
}

export function createRelatedCanvasTerminalShape({
  editor,
  shape,
  created,
  frameName,
  currentBounds,
  createId = createShapeId,
}: {
  editor: RelatedCanvasTerminalEditor;
  shape: CanvasTerminalShape;
  created: CreatedTerminalTabWithPane;
  frameName: string;
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
  const contextScope = shape.props.contextScope;
  const pinKey = buildCanvasTerminalPinKey(
    contextScope,
    shape.props.workspaceId,
    nextTmuxWindowName,
  );
  const gap = 32;
  const newX = bounds.maxX + gap;
  const newY = bounds.y;

  editor.createShape<CanvasTerminalShape>({
    id: newShapeId,
    type: CANVAS_TERMINAL_SHAPE_TYPE,
    x: newX,
    y: newY,
    props: createCanvasTerminalShapeProps({
      contextScope,
      workspaceId: shape.props.workspaceId,
      projectName: shape.props.projectName,
      workspaceName: shape.props.workspaceName,
      localPath: shape.props.localPath,
      terminalName: created.pane.label,
      tmuxWindowName: nextTmuxWindowName,
      paneAgent: created.pane.agent,
      sourceTerminalTabId: created.tab.id,
      isNewTerminal: true,
      isPinned: true,
      pinKey,
    }),
  });

  const parentShape = String(shape.parentId).startsWith("shape:")
    ? editor.getShape(shape.parentId as TLShapeId)
    : null;

  if (parentShape?.type === "frame") {
    const newBounds = editor.getShapePageBounds(newShapeId);
    const frameBounds = editor.getShapePageBounds(parentShape.id as TLShapeId);
    if (newBounds && frameBounds) {
      const frameProps = parentShape.props as { w?: number; h?: number };
      const nextFrameW = Math.max(frameProps.w ?? frameBounds.w, newBounds.maxX - frameBounds.x + 24);
      const nextFrameH = Math.max(frameProps.h ?? frameBounds.h, newBounds.maxY - frameBounds.y + 24);
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
    const frameX = bounds.x - 24;
    const frameY = bounds.y - 56;
    const frameRight = (newBounds?.maxX ?? bounds.maxX) + 24;
    const frameBottom = Math.max(bounds.maxY, newBounds?.maxY ?? bounds.maxY) + 24;
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
