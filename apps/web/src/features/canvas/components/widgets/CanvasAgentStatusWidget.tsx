"use client";

import * as React from "react";
import { useEditor, useValue } from "tldraw";

import { AgentStatusPopoverContent } from "@/app-shell/Footer";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
import {
  navigateToAgentStatusSession,
  resolveAgentStatusNavigationTarget,
} from "@/features/agent/lib/agent-status-navigation";
import {
  findCanvasTerminalShapeForAgentSession,
  focusCanvasTerminalShape,
} from "@/features/canvas/lib/canvas-terminal-focus";
import { getCanvasTerminalShapes } from "@/features/canvas/lib/canvas-terminal-shape";
import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";
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
          canvasTerminalKey(
            hostIdFromCenterKey(terminal.props.workspaceId),
            terminal.props.tmuxWindowName,
          ),
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
    (session: AgentStatusRecord) => {
      const target = resolveAgentStatusNavigationTarget(session);
      if (!target.contextId || !target.tmuxWindowName) return false;
      return canvasTerminalKeySet.has(
        canvasTerminalKey(target.contextId, target.tmuxWindowName),
      );
    },
    [canvasTerminalKeySet],
  );

  const handleNavigateSession = React.useCallback(
    (session: AgentStatusRecord) => {
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
      navigateToAgentStatusSession(session, router, projects);
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
