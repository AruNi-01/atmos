"use client";

import { useCallback } from "react";
import { createShapeId, type Editor, type TLShapeId } from "tldraw";

import {
  buildCanvasTerminalPinKey,
  CANVAS_TERMINAL_DEFAULT_SIZE,
  CANVAS_TERMINAL_SHAPE_TYPE,
  createCanvasTerminalShapeProps,
  dispatchCanvasTerminalPinStateChange,
  getCanvasTerminalShapes,
  type CanvasTerminalShape,
} from "@/features/canvas/lib/canvas-terminal-shape";
import { reparentCanvasShapeToFrame } from "@/features/canvas/lib/canvas-widget-frame";
import {
  getCanvasContextId,
  type CanvasContextRef,
} from "@/features/canvas/lib/canvas-widget-shape";
import {
  areShapeIdListsEqual,
  promoteRenderedShapeId,
} from "@/features/canvas/lib/canvas-terminal-rendering";
import { useCanvasSettingsStore } from "@/features/canvas/store/canvas-settings-store";
import { useCanvasRuntimeStore } from "@/features/canvas/store/canvas-runtime-store";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";

export function useAddCanvasTerminal(editor: Editor | null) {
  const createTerminalTabWithInitialPane = useTerminalStore(
    (state) => state.createTerminalTabWithInitialPane,
  );
  const setActiveShapeId = useCanvasRuntimeStore((state) => state.setActiveShapeId);
  const setRenderedShapeIds = useCanvasRuntimeStore((state) => state.setRenderedShapeIds);
  const maxRenderedTerminals = useCanvasSettingsStore((state) => state.maxRenderedTerminals);

  return useCallback(
    async (input: {
      context?: CanvasContextRef | null;
      frameId: TLShapeId | null;
      position?: { x: number; y: number };
      select?: boolean;
    }) => {
      if (!editor || !input.context) {
        return null;
      }

      const contextId = getCanvasContextId(input.context);
      if (!contextId) {
        return null;
      }

      const created = await createTerminalTabWithInitialPane(
        contextId,
        input.context.contextScope,
      );
      const tmuxWindowName = created?.pane.tmuxWindowName;
      if (!created || !tmuxWindowName) {
        return null;
      }

      const shapeId = createShapeId();
      const attachedAt = Date.now();
      const pinKey = buildCanvasTerminalPinKey(
        input.context.contextScope,
        contextId,
        tmuxWindowName,
      );
      const viewportCenter = editor.getViewportPageBounds().center;
      const position = input.position ?? {
        x: viewportCenter.x - CANVAS_TERMINAL_DEFAULT_SIZE.w / 2,
        y: viewportCenter.y - CANVAS_TERMINAL_DEFAULT_SIZE.h / 2,
      };

      editor.createShape<CanvasTerminalShape>({
        id: shapeId,
        type: CANVAS_TERMINAL_SHAPE_TYPE,
        x: position.x,
        y: position.y,
        props: createCanvasTerminalShapeProps({
          contextScope: input.context.contextScope,
          workspaceId: contextId,
          projectName: input.context.projectName,
          workspaceName: input.context.workspaceName ?? "",
          localPath: input.context.localPath,
          terminalName: created.pane.label,
          tmuxWindowName,
          paneAgent: created.pane.agent,
          sourceTerminalTabId: created.tab.id,
          isNewTerminal: true,
          isPinned: true,
          pinKey,
          lastAttachedAt: attachedAt,
        }),
      });
      reparentCanvasShapeToFrame(editor, shapeId, input.frameId);
      dispatchCanvasTerminalPinStateChange(pinKey, true);
      setActiveShapeId(shapeId);

      const currentRenderedShapeIds = useCanvasRuntimeStore.getState().renderedShapeIds;
      const nextRenderedShapeIds = promoteRenderedShapeId(
        getCanvasTerminalShapes(editor),
        currentRenderedShapeIds,
        shapeId,
        attachedAt,
        maxRenderedTerminals,
      );
      if (!areShapeIdListsEqual(nextRenderedShapeIds, currentRenderedShapeIds)) {
        setRenderedShapeIds(nextRenderedShapeIds);
      }

      if (input.select !== false) {
        editor.select(shapeId);
      }
      return shapeId;
    },
    [
      createTerminalTabWithInitialPane,
      editor,
      maxRenderedTerminals,
      setActiveShapeId,
      setRenderedShapeIds,
    ],
  );
}
