"use client";

import * as React from "react";
import { useEditor, type TLShapeId } from "tldraw";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useProjectStore } from "@/features/project/store/use-project-store";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
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
  const projects = useProjectStore((state) => state.projects);
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

    const created = await createTerminalTabWithInitialPane(
      shape.props.workspaceId,
      shape.props.contextScope,
    );
    if (!created) {
      return { status: "terminal-create-failed" };
    }

    const result = createRelatedCanvasTerminalShape({
      editor,
      shape,
      created,
      frameName: resolveRelatedCanvasTerminalFrameName(projects, shape),
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

    const base = shape.props.contextScope === "project" ? "/project" : "/workspace";
    const params = new URLSearchParams();
    params.set("id", shape.props.workspaceId);
    params.set("tab", result.terminalTabId);
    params.set("terminalTmux", result.tmuxWindowName);
    params.set("canvas", "true");
    router.replace(`${base}?${params.toString()}`);

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
