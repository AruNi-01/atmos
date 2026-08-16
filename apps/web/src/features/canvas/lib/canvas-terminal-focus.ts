import type { Editor, TLShapeId } from "tldraw";

import { resolveAgentHookNavigationTarget } from "@/features/agent/lib/agent-hook-navigation";
import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";
import { writeLastPinnedTerminal, type CanvasLastPinnedTerminal } from "@/shared/stores/use-ui-pref-hooks";

import {
  getCanvasTerminalShapes,
  type CanvasTerminalShape,
} from "./canvas-terminal-shape";
import { promoteRenderedShapeId } from "./canvas-terminal-rendering";
import { focusCanvasShapes } from "./canvas-shape-focus";

export function rememberLastPinnedTerminal(
  boardGuid: string | undefined,
  pinKey: string,
  shapeId: string,
): void {
  const entry: CanvasLastPinnedTerminal = {
    pinKey,
    shapeId,
    pinnedAt: Date.now(),
  };
  writeLastPinnedTerminal(entry, boardGuid);
}

export function findPinnedTerminalShape(
  editor: Editor,
  hint: Pick<CanvasLastPinnedTerminal, "pinKey" | "shapeId">,
): CanvasTerminalShape | null {
  const shapes = getCanvasTerminalShapes(editor);
  const byId = shapes.find((shape) => shape.id === hint.shapeId);
  if (byId) return byId;
  return shapes.find((shape) => shape.props.pinKey === hint.pinKey) ?? null;
}

/** Window name encoded inside an agent-hook pane id (`"{workspaceId}:{windowName}"`). */
export function tmuxWindowNameFromAgentPaneId(paneId: string | null | undefined): string | null {
  if (!paneId) return null;
  const windowName = paneId.split(":").slice(1).join(":");
  return windowName || null;
}

/** Matches an agent-hook session to a live canvas-terminal shape on the current page. */
export function findCanvasTerminalShapeForAgentSession(
  editor: Editor,
  session: {
    context_id?: string | null;
    pane_id?: string | null;
    side_chat_id?: string | null;
    source_pane_id?: string | null;
    terminal_kind?: string | null;
  },
): CanvasTerminalShape | null {
  const target = resolveAgentHookNavigationTarget(session);
  if (!target.contextId || !target.tmuxWindowName) return null;
  return (
    getCanvasTerminalShapes(editor).find(
      (shape) =>
        shape.props.workspaceId === target.contextId &&
        shape.props.tmuxWindowName === target.tmuxWindowName,
    ) ?? null
  );
}

export function focusCanvasTerminalShape(
  editor: Editor,
  shape: CanvasTerminalShape,
  options: {
    maxRenderedTerminals: number;
    setActiveShapeId: (id: TLShapeId) => void;
    setRenderedShapeIds: (ids: TLShapeId[]) => void;
    renderedShapeIds: TLShapeId[];
    setFocusPulseShapeIds: (ids: TLShapeId[]) => void;
    getFocusPulseShapeIds?: () => TLShapeId[];
    animateCamera?: boolean;
  },
): void {
  const shapeId = shape.id as TLShapeId;
  const attachedAt = Date.now();
  // Same stable pane key as terminal panes / agent hooks.
  const stablePaneId = `${shape.props.workspaceId}:${shape.props.tmuxWindowName}`;

  const nextRendered = promoteRenderedShapeId(
    getCanvasTerminalShapes(editor),
    options.renderedShapeIds,
    shapeId,
    attachedAt,
    options.maxRenderedTerminals,
  );
  options.setRenderedShapeIds(nextRendered);
  options.setActiveShapeId(shapeId);
  // Treat focusing a canvas terminal like focusing its source terminal pane.
  useAgentAttentionStore.getState().notifyPaneFocused(stablePaneId);

  try {
    editor.select(shapeId);
    editor.updateShape({
      id: shapeId,
      type: shape.type,
      props: { lastAttachedAt: attachedAt },
    });
  } catch {
    // Editor may still be hydrating.
  }

  focusCanvasShapes(editor, [shapeId], {
    animateCamera: options.animateCamera,
    getFocusPulseShapeIds: options.getFocusPulseShapeIds,
    setFocusPulseShapeIds: options.setFocusPulseShapeIds,
  });
}
