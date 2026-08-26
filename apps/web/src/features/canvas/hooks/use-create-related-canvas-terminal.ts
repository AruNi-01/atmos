"use client";

import * as React from "react";
import { useEditor, type TLShapeId } from "tldraw";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
import {
  buildCanvasTerminalSourcePath,
  resolveCanvasTerminalSourceTarget,
} from "@/features/canvas/lib/canvas-terminal-source";
import { useCanvasSettingsStore } from "@/features/canvas/store/canvas-settings-store";
import { useCanvasRuntimeStore } from "@/features/canvas/store/canvas-runtime-store";
import {
  createRelatedCanvasTerminalShape,
  resolveRelatedCanvasTerminalFrameName,
} from "@/features/canvas/lib/create-related-canvas-terminal";
import {
  CANVAS_TERMINAL_SHAPE_TYPE,
  dispatchCanvasTerminalPinStateChange,
  getCanvasTerminalShapes,
  type CanvasTerminalShape,
} from "@/features/canvas/lib/canvas-terminal-shape";
import {
  areShapeIdListsEqual,
  promoteRenderedShapeId,
} from "@/features/canvas/lib/canvas-terminal-rendering";

export type CreateRelatedCanvasTerminalResult =
  | { status: "created" }
  | { status: "placement-failed" }
  | { status: "terminal-create-failed" };

export function useCreateRelatedCanvasTerminal(shape: CanvasTerminalShape) {
  const editor = useEditor();
  const router = useAppRouter();
  const projects = useProjects();
  const createTerminalTabWithInitialPane = useTerminalStore((state) => state.createTerminalTabWithInitialPane);
  const renderedShapeIds = useCanvasRuntimeStore((state) => state.renderedShapeIds);
  const setActiveShapeId = useCanvasRuntimeStore((state) => state.setActiveShapeId);
  const setRenderedShapeIds = useCanvasRuntimeStore((state) => state.setRenderedShapeIds);
  const maxRenderedTerminals = useCanvasSettingsStore((state) => state.maxRenderedTerminals);

  return React.useCallback(async (): Promise<CreateRelatedCanvasTerminalResult> => {
    const currentBounds = editor.getShapePageBounds(shape.id as TLShapeId);
    if (!currentBounds) {
      return { status: "placement-failed" };
    }

    const sourceTarget = resolveCanvasTerminalSourceTarget(shape.props);
    const created = await createTerminalTabWithInitialPane(
      sourceTarget.paintContextId,
      sourceTarget.contextScope,
    );
    if (!created) {
      return { status: "terminal-create-failed" };
    }

    const result = createRelatedCanvasTerminalShape({
      editor,
      shape,
      created,
      frameName: resolveRelatedCanvasTerminalFrameName(projects, shape.props),
      sourceContext: {
        ...shape.props,
        workspaceId: sourceTarget.paintContextId,
        contextScope: sourceTarget.contextScope,
      },
      currentBounds,
    });
    if (!result) {
      return { status: "placement-failed" };
    }

    dispatchCanvasTerminalPinStateChange(result.pinKey, true);
    setActiveShapeId(result.newShapeId);
    editor.select(result.newShapeId);

    const attachedAt = Date.now();
    const nextRenderedShapeIds = promoteRenderedShapeId(
      getCanvasTerminalShapes(editor),
      renderedShapeIds,
      result.newShapeId,
      attachedAt,
      maxRenderedTerminals,
    );
    if (!areShapeIdListsEqual(nextRenderedShapeIds, renderedShapeIds)) {
      setRenderedShapeIds(nextRenderedShapeIds);
    }
    editor.updateShape({
      id: result.newShapeId,
      type: CANVAS_TERMINAL_SHAPE_TYPE,
      props: {
        lastAttachedAt: attachedAt,
      },
    });

    router.replace(
      buildCanvasTerminalSourcePath(
        { ...sourceTarget, tmuxWindowName: result.tmuxWindowName },
        { terminalTabId: result.terminalTabId, canvas: true },
      ),
    );

    return { status: "created" };
  }, [
    createTerminalTabWithInitialPane,
    editor,
    maxRenderedTerminals,
    projects,
    renderedShapeIds,
    router,
    setActiveShapeId,
    setRenderedShapeIds,
    shape,
  ]);
}
