"use client";

import React from "react";

import { canvasApi } from "@/api/rest-api";
import { createCanvasSnapshot, createDefaultCanvasSession, createDefaultDocument, parseBoardDocument } from "@/components/canvas/use-canvas-board";
import {
  buildCanvasTerminalPinKey,
  CANVAS_TERMINAL_PIN_STATE_EVENT,
  createCanvasTerminalShapeProps,
  dispatchCanvasTerminalPinStateChange,
  getPinnedCanvasTerminalPinKeys,
  pinCanvasTerminalShapeInSnapshot,
} from "@/components/canvas/canvas-terminal-shape";
import { rememberLastPinnedTerminal } from "@/components/canvas/canvas-terminal-focus";
import { readCanvasSession } from "@/hooks/use-ui-pref-hooks";
import { FIXED_TERMINAL_TAB_VALUE } from "@/hooks/use-terminal-store";
import { toastManager } from "@workspace/ui";
import { getTerminalDisplayMeta } from "./terminal-title";
import type { TerminalPaneAgent, TerminalPaneProps } from "./types";

type TerminalGridWorkspaceInfo = {
  projectName: string;
  workspaceName: string;
  localPath: string;
};

type UseTerminalGridCanvasPinsOptions = {
  configuredAgents: TerminalPaneAgent[];
  isProjectContext: boolean;
  panes: Record<string, TerminalPaneProps>;
  terminalTabId?: string;
  workspaceId: string;
  workspaceInfo: TerminalGridWorkspaceInfo | null;
};

export function useTerminalGridCanvasPins({
  configuredAgents,
  isProjectContext,
  panes,
  terminalTabId,
  workspaceId,
  workspaceInfo,
}: UseTerminalGridCanvasPinsOptions) {
  const [pinnedPaneKeys, setPinnedPaneKeys] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    let cancelled = false;

    const loadPinnedPaneKeys = async () => {
      try {
        const board = await canvasApi.getDefaultBoard();
        const document = board.document_json
          ? parseBoardDocument(board.document_json)
          : createDefaultDocument();

        if (!cancelled) {
          setPinnedPaneKeys(
            getPinnedCanvasTerminalPinKeys(
              createCanvasSnapshot(document.tldrawDocument, createDefaultCanvasSession()),
            ),
          );
        }
      } catch {
        if (!cancelled) {
          setPinnedPaneKeys(new Set());
        }
      }
    };

    const handlePinStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ pinKey?: string; pinned?: boolean }>).detail;
      if (!detail?.pinKey) {
        return;
      }

      const pinKey = detail.pinKey;
      setPinnedPaneKeys((current) => {
        const next = new Set(current);
        if (detail.pinned) {
          next.add(pinKey);
        } else {
          next.delete(pinKey);
        }
        return next;
      });
    };

    void loadPinnedPaneKeys();
    window.addEventListener(CANVAS_TERMINAL_PIN_STATE_EVENT, handlePinStateChange);

    return () => {
      cancelled = true;
      window.removeEventListener(CANVAS_TERMINAL_PIN_STATE_EVENT, handlePinStateChange);
    };
  }, []);

  const pinPaneToCanvas = React.useCallback(async (id?: string | null) => {
    if (!id) return;

    const pane = panes[id];
    if (!pane || !workspaceInfo?.localPath) {
      return;
    }

    if (!pane.tmuxWindowName || pane.isNewPane) {
      toastManager.add({
        title: "Canvas",
        description: "This terminal cannot be pinned until the session is fully attached.",
        type: "error",
      });
      return;
    }

    const contextScope = isProjectContext ? "project" : "workspace";
    const pinKey = buildCanvasTerminalPinKey(contextScope, workspaceId, pane.tmuxWindowName);

    if (pinnedPaneKeys.has(pinKey)) {
      return;
    }

    try {
      const board = await canvasApi.getDefaultBoard();
      const document = board.document_json
        ? parseBoardDocument(board.document_json)
        : createDefaultDocument();
      const result = pinCanvasTerminalShapeInSnapshot(
        createCanvasSnapshot(
          document.tldrawDocument,
          readCanvasSession(board.guid) ?? createDefaultCanvasSession(),
        ),
        createCanvasTerminalShapeProps({
          contextScope,
          workspaceId,
          projectName: workspaceInfo.projectName,
          workspaceName: workspaceInfo.workspaceName,
          localPath: workspaceInfo.localPath,
          terminalName: (() => {
            const { displayTitle } = getTerminalDisplayMeta({
              baseTitle: pane.label,
              dynamicTitle: pane.dynamicTitle,
              configuredAgents,
              agent: pane.agent,
            });
            const trimmed = displayTitle.trim();
            return trimmed || pane.label;
          })(),
          tmuxWindowName: pane.tmuxWindowName,
          paneAgent: pane.agent,
          sourceTerminalTabId: terminalTabId ?? FIXED_TERMINAL_TAB_VALUE,
          isNewTerminal: false,
          isPinned: true,
          pinKey,
        }),
      );

      await canvasApi.updateDefaultBoard(
        JSON.stringify({
          ...document,
          tldrawDocument: result.snapshot.document,
        }),
      );
      rememberLastPinnedTerminal(board.guid, pinKey, result.shapeId);
      dispatchCanvasTerminalPinStateChange(pinKey, true);

      toastManager.add({
        title: "Canvas",
        description: result.inserted ? "Pinned to Canvas" : "Already pinned to Canvas",
        type: "success",
      });
    } catch (error) {
      toastManager.add({
        title: "Canvas",
        description: error instanceof Error ? error.message : "Failed to pin terminal to Canvas",
        type: "error",
      });
    }
  }, [isProjectContext, panes, pinnedPaneKeys, workspaceId, workspaceInfo, configuredAgents, terminalTabId]);

  return {
    pinnedPaneKeys,
    pinPaneToCanvas,
  };
}
