"use client";

import * as React from "react";
import { useEditor, useValue } from "tldraw";

import { AgentStatusPopoverContent } from "@/app-shell/Footer";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import type { AgentHookSession } from "@/features/agent/store/agent-hooks-store";
import {
  navigateToAgentHookSessionPane,
} from "@/features/agent/lib/agent-hook-navigation";
import {
  findCanvasTerminalShapeForAgentSession,
  focusCanvasTerminalShape,
  tmuxWindowNameFromAgentPaneId,
} from "@/features/canvas/lib/canvas-terminal-focus";
import { getCanvasTerminalShapes } from "@/features/canvas/lib/canvas-terminal-shape";
import { useCanvasRuntimeStore } from "@/features/canvas/store/canvas-runtime-store";
import { useCanvasSettingsStore } from "@/features/canvas/store/canvas-settings-store";
import type {
  CanvasWidgetShape,
  CanvasWidgetSourceRef,
} from "@/features/canvas/lib/canvas-widget-shape";

type CanvasAgentStatusWidgetSource = Extract<CanvasWidgetSourceRef, { type: "agent-status" }>;

const CANVAS_TERMINAL_KEY_SEPARATOR = "\u0000";

function canvasTerminalKey(workspaceId: string, tmuxWindowName: string): string {
  return `${workspaceId}${CANVAS_TERMINAL_KEY_SEPARATOR}${tmuxWindowName}`;
}

export function CanvasAgentStatusWidget({ shape }: { shape: CanvasWidgetShape }) {
  const source = shape.props.source as CanvasAgentStatusWidgetSource;
  const editor = useEditor();
  const router = useAppRouter();
  const projects = useProjects();
  const setActiveShapeId = useCanvasRuntimeStore((state) => state.setActiveShapeId);
  const setRenderedShapeIds = useCanvasRuntimeStore((state) => state.setRenderedShapeIds);
  const setFocusPulseShapeIds = useCanvasRuntimeStore((state) => state.setFocusPulseShapeIds);
  const maxRenderedTerminals = useCanvasSettingsStore((state) => state.maxRenderedTerminals);

  const canvasTerminalKeysSignature = useValue(
    "canvas-agent-status.terminal-keys",
    () =>
      getCanvasTerminalShapes(editor)
        .map((terminal) =>
          canvasTerminalKey(terminal.props.workspaceId, terminal.props.tmuxWindowName),
        )
        .sort()
        .join("|"),
    [editor],
  );

  const canvasTerminalKeySet = React.useMemo(
    () => new Set(canvasTerminalKeysSignature ? canvasTerminalKeysSignature.split("|") : []),
    [canvasTerminalKeysSignature],
  );

  const isSessionOnCanvas = React.useCallback(
    (session: AgentHookSession) => {
      const contextId = session.context_id;
      if (!contextId) return false;
      const tmuxWindowName = tmuxWindowNameFromAgentPaneId(session.pane_id);
      if (!tmuxWindowName) return false;
      return canvasTerminalKeySet.has(canvasTerminalKey(contextId, tmuxWindowName));
    },
    [canvasTerminalKeySet],
  );

  const handleNavigateSession = React.useCallback(
    (session: AgentHookSession) => {
      const terminalShape = findCanvasTerminalShapeForAgentSession(editor, session);
      if (terminalShape) {
        focusCanvasTerminalShape(editor, terminalShape, {
          maxRenderedTerminals,
          setActiveShapeId,
          setRenderedShapeIds,
          renderedShapeIds: useCanvasRuntimeStore.getState().renderedShapeIds,
          getFocusPulseShapeIds: () => useCanvasRuntimeStore.getState().focusPulseShapeIds,
          setFocusPulseShapeIds,
        });
        return;
      }
      navigateToAgentHookSessionPane(session, router, projects);
    },
    [
      editor,
      maxRenderedTerminals,
      projects,
      router,
      setActiveShapeId,
      setFocusPulseShapeIds,
      setRenderedShapeIds,
    ],
  );

  if (source.type !== "agent-status") {
    return null;
  }

  return (
    <div className="h-full min-h-0 overflow-hidden bg-background">
      <AgentStatusPopoverContent
        embedded
        onNavigateSession={handleNavigateSession}
        isSessionOnCanvas={isSessionOnCanvas}
      />
    </div>
  );
}
