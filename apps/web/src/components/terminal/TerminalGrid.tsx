"use client";

// Suppress React 19 ref warnings from react-mosaic-component
// This must be imported before react-mosaic-component
import "@/lib/suppress-react19-ref-warning";

import React, { useCallback, useEffect } from "react";
import {
  Mosaic,
  MosaicWindow,
  MosaicNode,
  MosaicPath,
} from "react-mosaic-component";
import {
  X,
  Columns,
  Rows,
  Bot,
  Loader2,
  Plus,
  Maximize2,
  AlertTriangle,
  ClipboardPaste,
  Maximize,
  Minimize,
  SquareTerminal,
  ArrowLeft,
  ArrowRight,
  Pin,
} from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  cn,
  toastManager,
} from "@workspace/ui";
import { Terminal, TerminalRef } from "./Terminal";
import type { MosaicBranch, TerminalPaneAgent } from "./types";
import { getTerminalDisplayMeta, isPathLikeTitle, resolveAgentForTitle, TerminalTitleWithAgent } from "./terminal-title";
import { systemApi } from "@/api/rest-api";
import { useTerminalStore } from "@/hooks/use-terminal-store";
import { useProjectStore } from "@/hooks/use-project-store";
import { AgentIcon } from "@/components/agent/AgentIcon";
import { AGENT_STATE, useAgentHooksStore } from "@/hooks/use-agent-hooks-store";
import { AgentHookStatusIndicator } from "@/components/agent/AgentHookStatusIndicator";
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

import "react-mosaic-component/react-mosaic-component.css";
import "./terminal-grid.css";

type TerminalGridScope = "default" | "project-wiki" | "code-review";

/** Control which toolbar action buttons to show. Omitted or true = show, false = hide. */
export interface TerminalToolbarActions {
  /** Split horizontal/vertical buttons */
  split?: boolean;
  /** Maximize/restore button */
  maximize?: boolean;
  /** Close pane button */
  close?: boolean;
}

interface TerminalGridProps {
  workspaceId: string;
  className?: string;
  terminalTabId?: string;
  quickOpenAgents?: Array<{
    agent: TerminalPaneAgent;
    command: string;
  }>;
  /** When "project-wiki", uses separate panes/layout (does not affect main Terminal tab) */
  scope?: TerminalGridScope;
  /** Which toolbar action buttons to show. Default: all true. Use e.g. { split: false, maximize: false, close: false } for Project Wiki. */
  toolbarActions?: TerminalToolbarActions;
  /** When true, workspaceId refers to a project ID (use project layout API). When false, it's a workspace ID. */
  isProjectContext?: boolean;
  /** Create a new center-stage terminal tab. Triggered by scoped Cmd+T in terminal grids. */
  onNewTerminalTab?: () => void;
}

export interface TerminalGridHandle {
  addTerminal: (label?: string, agent?: TerminalPaneAgent) => void;
  /** Create a new terminal tab and run command after session is ready */
  createAndRunTerminal: (options: { label: string; command: string; agent?: TerminalPaneAgent }) => Promise<void>;
  /** Create or focus terminal by label/window name (e.g. "Generate Project Wiki") and run command. Reuses existing pane if found. */
  createOrFocusAndRunTerminal: (options: { label: string; command: string; agent?: TerminalPaneAgent }) => Promise<void>;
  /** Remove terminal pane by tmux window name. Used when killing backend tmux window before replace. */
  removeTerminalByTmuxWindowName: (tmuxWindowName: string) => void;
  /** Create a new terminal and pre-fill command text without executing it */
  prefillTerminal: (options: { label: string; command: string; agent?: TerminalPaneAgent }) => void;
  destroyAllTerminals: () => void;
  /** Focus the currently active pane's terminal input */
  focusActivePane: () => void;
}

const DEFAULT_TOOLBAR_ACTIONS: Required<TerminalToolbarActions> = {
  split: true,
  maximize: true,
  close: true,
};

const IDLE_SHELL_COMMANDS = new Set([
  "bash",
  "zsh",
  "fish",
  "sh",
  "dash",
  "ksh",
  "mksh",
  "tcsh",
  "csh",
  "nu",
  "xonsh",
]);

function isIdleShellCommand(command: string | null | undefined): boolean {
  const normalized = command?.trim().split("/").filter(Boolean).pop()?.toLowerCase();
  return Boolean(normalized && IDLE_SHELL_COMMANDS.has(normalized));
}

function flattenMosaicLayout(layout: MosaicNode<string> | null): string[] {
  if (!layout) return [];
  if (typeof layout === "string") return [layout];
  const branch = layout as MosaicBranch<string>;
  return [...flattenMosaicLayout(branch.first), ...flattenMosaicLayout(branch.second)];
}

function TerminalPaneAgentStatus({ paneId }: { paneId: string; contextId: string }) {
  // Only show status for this specific pane – do NOT fall back to context-level
  // state, which would cause all windows in the same workspace to show RUNNING
  // whenever any one of them has an agent active.
  const paneState = useAgentHooksStore((s) => s.getAgentStateForPaneId(paneId));

  if (paneState === AGENT_STATE.IDLE) return null;

  return (
    <AgentHookStatusIndicator
      state={paneState}
      variant="full"
      className="ml-2"
    />
  );
}

export const TerminalGrid = React.forwardRef<TerminalGridHandle, TerminalGridProps>(({ workspaceId, className, terminalTabId, quickOpenAgents = [], scope = "default", toolbarActions, isProjectContext = false, onNewTerminalTab }, ref) => {
  // Track terminal refs for each pane to call destroy on close
  const terminalRefsMap = React.useRef<Map<string, TerminalRef>>(new Map());
  // Pending commands to send when terminal session becomes ready (createAndRunTerminal flow)
  const pendingCommandsRef = React.useRef<Map<string, string>>(new Map());
  // Track panes whose session has already become ready, so we know whether
  // to call sendText directly or queue a pending command for onSessionReady.
  const readyPanesRef = React.useRef<Set<string>>(new Set());
  const [splitMenuKey, setSplitMenuKey] = React.useState<string | null>(null);
  const [isPaneDragging, setIsPaneDragging] = React.useState(false);
  const [activePaneId, setActivePaneId] = React.useState<string | null>(null);
  const [closeConfirmPaneId, setCloseConfirmPaneId] = React.useState<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const [pinnedPaneKeys, setPinnedPaneKeys] = React.useState<Set<string>>(() => new Set());
  const splitMenuTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const isProjectWiki = scope === "project-wiki";
  const isCodeReview = scope === "code-review";
  const actions = React.useMemo(
    () => ({ ...DEFAULT_TOOLBAR_ACTIONS, ...toolbarActions }),
    [toolbarActions],
  );
  const configuredAgents = React.useMemo(
    () => quickOpenAgents.map(({ agent }) => agent),
    [quickOpenAgents],
  );

  const {
    getPanes,
    getLayout,
    setLayout,
    initWorkspace,
    isWorkspaceReady,
    addTerminal: addTerminalToStore,
    removeTerminal: removeTerminalFromStore,
    getPaneIdByTmuxWindowName,
    splitTerminal: splitTerminalInStore,
    toggleMaximize,
    getMaximizedTerminalId,
    setDynamicTitle,
    setPaneAgent,
    markPaneAttached,
    getProjectWikiPanes,
    getProjectWikiLayout,
    setProjectWikiLayout,
    addProjectWikiTerminal,
    removeProjectWikiTerminal,
    splitProjectWikiTerminal,
    initProjectWikiWorkspace,
    getProjectWikiPaneIdByTmuxWindowName,
    setProjectWikiDynamicTitle,
    setProjectWikiPaneAgent,
    markProjectWikiPaneAttached,
    toggleProjectWikiMaximize,
    isProjectWikiReady,
    projectWikiMaximizedIds,
    getCodeReviewPanes,
    getCodeReviewLayout,
    setCodeReviewLayout,
    addCodeReviewTerminal,
    removeCodeReviewTerminal,
    splitCodeReviewTerminal,
    initCodeReviewWorkspace,
    getCodeReviewPaneIdByTmuxWindowName,
    setCodeReviewDynamicTitle,
    setCodeReviewPaneAgent,
    markCodeReviewPaneAttached,
    toggleCodeReviewMaximize,
    isCodeReviewReady,
    codeReviewMaximizedIds,
  } = useTerminalStore();

  const panes = isCodeReview
    ? getCodeReviewPanes(workspaceId)
    : isProjectWiki
    ? getProjectWikiPanes(workspaceId)
    : getPanes(workspaceId, terminalTabId);
  const layout = isCodeReview
    ? getCodeReviewLayout(workspaceId)
    : isProjectWiki
    ? getProjectWikiLayout(workspaceId)
    : getLayout(workspaceId, terminalTabId);
  const workspaceReady = isCodeReview
    ? isCodeReviewReady(workspaceId)
    : isProjectWiki
    ? isProjectWikiReady(workspaceId)
    : isWorkspaceReady(workspaceId, terminalTabId);
  const maximizedId = isCodeReview
    ? codeReviewMaximizedIds[workspaceId]
    : isProjectWiki
    ? projectWikiMaximizedIds[workspaceId]
    : getMaximizedTerminalId(workspaceId, terminalTabId);

  const projects = useProjectStore(s => s.projects);
  const isProjectsLoading = useProjectStore(s => s.isLoading);

  // Look up project and workspace info for human-readable naming
  const workspaceInfo = (() => {
    for (const project of projects) {
      if (project.id === workspaceId) {
        return {
          projectName: project.name,
          workspaceName: "Main",
          localPath: project.mainFilePath,
        };
      }
      const workspace = project.workspaces.find(w => w.id === workspaceId);
      if (workspace) {
        return {
          projectName: project.name,
          workspaceName: workspace.name,
          localPath: workspace.localPath,
        };
      }
    }
    return null;
  })();

  const workspaceExists = !!workspaceInfo;

  useEffect(() => {
    if (workspaceExists) {
      if (isCodeReview) {
        initCodeReviewWorkspace(workspaceId);
      } else if (isProjectWiki) {
        initProjectWikiWorkspace(workspaceId);
      } else {
        initWorkspace(workspaceId, isProjectContext, terminalTabId);
      }
    }
  }, [workspaceId, workspaceExists, initWorkspace, initProjectWikiWorkspace, initCodeReviewWorkspace, isProjectWiki, isCodeReview, isProjectContext, terminalTabId]);

  const hasPanes = Object.keys(panes).length > 0;
  const paneOrder = React.useMemo(
    () => flattenMosaicLayout(layout).filter((paneId) => Boolean(panes[paneId])),
    [layout, panes],
  );
  const hasMultiplePanes = paneOrder.length > 1;
  const effectiveActivePaneId = activePaneId && paneOrder.includes(activePaneId)
    ? activePaneId
    : paneOrder[0] ?? null;

  const focusPane = useCallback((paneId: string | undefined | null) => {
    if (!paneId || !panes[paneId]) return;
    setActivePaneId(paneId);
    window.setTimeout(() => {
      terminalRefsMap.current.get(paneId)?.focus();
    }, 0);
  }, [panes]);

  const getFocusedPaneId = useCallback(() => effectiveActivePaneId, [effectiveActivePaneId]);

  const focusPaneByOffset = useCallback((offset: 1 | -1) => {
    if (paneOrder.length === 0) return;
    const currentId = getFocusedPaneId();
    const currentIndex = Math.max(0, currentId ? paneOrder.indexOf(currentId) : 0);
    const nextIndex = (currentIndex + offset + paneOrder.length) % paneOrder.length;
    focusPane(paneOrder[nextIndex]);
  }, [focusPane, getFocusedPaneId, paneOrder]);

  const getPaneId = useCallback((ctxWorkspaceId: string, tmuxWindowName: string) => {
    if (isCodeReview) {
      return getCodeReviewPaneIdByTmuxWindowName(ctxWorkspaceId, tmuxWindowName);
    }
    if (isProjectWiki) {
      return getProjectWikiPaneIdByTmuxWindowName(ctxWorkspaceId, tmuxWindowName);
    }
    return getPaneIdByTmuxWindowName(ctxWorkspaceId, tmuxWindowName, terminalTabId);
  }, [getCodeReviewPaneIdByTmuxWindowName, getPaneIdByTmuxWindowName, getProjectWikiPaneIdByTmuxWindowName, isCodeReview, isProjectWiki, terminalTabId]);
  const getPaneIdByLabelOrWindowName = useCallback((labelOrWindowName: string) => {
    const entry = Object.entries(panes).find(([, pane]) =>
      pane.label === labelOrWindowName || pane.tmuxWindowName === labelOrWindowName
    );
    return entry?.[0] ?? getPaneId(workspaceId, labelOrWindowName);
  }, [getPaneId, panes, workspaceId]);
  const addTerminal = useCallback((label?: string, agent?: TerminalPaneAgent) => {
    const result = (() => {
      if (isCodeReview) {
        return addCodeReviewTerminal(workspaceId, label, agent);
      }
      if (isProjectWiki) {
        return addProjectWikiTerminal(workspaceId, label, agent);
      }
      return addTerminalToStore(workspaceId, label, terminalTabId, agent);
    })();
    if (result) {
      focusPane(result);
    }
    return result;
  }, [addCodeReviewTerminal, addProjectWikiTerminal, addTerminalToStore, focusPane, isCodeReview, isProjectWiki, terminalTabId, workspaceId]);
  const removeTerminalFromScope = useCallback((id: string) => {
    if (isCodeReview) {
      removeCodeReviewTerminal(workspaceId, id);
      return;
    }
    if (isProjectWiki) {
      removeProjectWikiTerminal(workspaceId, id);
      return;
    }
    removeTerminalFromStore(workspaceId, id, terminalTabId);
  }, [isCodeReview, isProjectWiki, removeCodeReviewTerminal, removeProjectWikiTerminal, removeTerminalFromStore, terminalTabId, workspaceId]);

  React.useImperativeHandle(ref, () => ({
    addTerminal: (label?: string, agent?: TerminalPaneAgent) => addTerminal(label, agent),
    createAndRunTerminal: async ({ label, command, agent }) => {
      // If there's exactly one fresh default pane (no agent, no pending command),
      // reuse it directly instead of creating a second terminal window.
      const currentPanes = Object.entries(panes);
      if (currentPanes.length === 1) {
        const [existingId, existingPane] = currentPanes[0];
        if (!existingPane.agent && !pendingCommandsRef.current.has(existingId)) {
          if (agent) {
            setPaneAgent(workspaceId, existingId, agent);
          }
          const termRef = terminalRefsMap.current.get(existingId);
          // Only send immediately when the underlying tmux session has reported
          // input-ready. Otherwise the websocket is still attaching and the
          // input would be silently dropped — queue it for onSessionReady.
          if (termRef && readyPanesRef.current.has(existingId)) {
            termRef.sendText(command + "\r");
          } else {
            pendingCommandsRef.current.set(existingId, command + "\r");
          }
          return;
        }
      }
      const paneId = addTerminal(label, agent);
      pendingCommandsRef.current.set(paneId, command + "\r");
    },
    createOrFocusAndRunTerminal: async ({ label, command, agent }) => {
      const existingPaneId = getPaneIdByLabelOrWindowName(label);
      const cmd = command.trim() + "\r";
      if (existingPaneId) {
        const termRef = terminalRefsMap.current.get(existingPaneId);
        if (termRef) {
          termRef.sendText(cmd);
        } else {
          pendingCommandsRef.current.set(existingPaneId, cmd);
        }
        return;
      }
      const paneId = addTerminal(label, agent);
      pendingCommandsRef.current.set(paneId, cmd);
    },
    removeTerminalByTmuxWindowName: (tmuxWindowName: string) => {
      const paneId = getPaneId(workspaceId, tmuxWindowName);
      if (!paneId) return;
      const terminalRef = terminalRefsMap.current.get(paneId);
      if (terminalRef) {
        terminalRef.destroy();
        terminalRefsMap.current.delete(paneId);
      }
      removeTerminalFromScope(paneId);
    },
    prefillTerminal: ({ label, command, agent }) => {
      const paneId = addTerminal(label, agent);
      // Pre-fill without \r so the command is typed but not executed
      pendingCommandsRef.current.set(paneId, command);
    },
    destroyAllTerminals: () => {
      for (const terminalRef of terminalRefsMap.current.values()) {
        terminalRef.destroy();
      }
      terminalRefsMap.current.clear();
    },
    focusActivePane: () => {
      if (effectiveActivePaneId) {
        focusPane(effectiveActivePaneId);
      }
    },
  }), [workspaceId, addTerminal, effectiveActivePaneId, focusPane, getPaneId, getPaneIdByLabelOrWindowName, removeTerminalFromScope, panes, setPaneAgent]);

  const setLayoutForScope = isCodeReview
    ? setCodeReviewLayout
    : isProjectWiki
    ? setProjectWikiLayout
    : setLayout;
  const toggleMaximizeForScope = isCodeReview
    ? toggleCodeReviewMaximize
    : isProjectWiki
    ? toggleProjectWikiMaximize
    : toggleMaximize;
  const setDynamicTitleForScope = isCodeReview
    ? setCodeReviewDynamicTitle
    : isProjectWiki
    ? setProjectWikiDynamicTitle
    : setDynamicTitle;
  const setPaneAgentForScope = isCodeReview
    ? setCodeReviewPaneAgent
    : isProjectWiki
    ? setProjectWikiPaneAgent
    : setPaneAgent;

  const onChange = useCallback((newLayout: MosaicNode<string> | null) => {
    if (isCodeReview || isProjectWiki) {
      setLayoutForScope(workspaceId, newLayout);
      return;
    }
    setLayoutForScope(workspaceId, newLayout, terminalTabId);
  }, [workspaceId, setLayoutForScope, isCodeReview, isProjectWiki, terminalTabId]);

  const removeTerminal = useCallback((id: string) => {
    // Find the next pane to focus before removing the current one
    const currentIndex = paneOrder.indexOf(id);
    let nextPaneId: string | null = null;

    if (currentIndex !== -1 && paneOrder.length > 1) {
      // Try to focus the previous pane, or the next one if there's no previous
      if (currentIndex > 0) {
        nextPaneId = paneOrder[currentIndex - 1];
      } else if (currentIndex < paneOrder.length - 1) {
        nextPaneId = paneOrder[currentIndex + 1];
      }
    }

    const terminalRef = terminalRefsMap.current.get(id);
    if (terminalRef) {
      terminalRef.destroy();
      terminalRefsMap.current.delete(id);
    }
    removeTerminalFromScope(id);

    // Focus the next pane after removal
    if (nextPaneId) {
      // Use setTimeout to ensure the layout has updated
      window.setTimeout(() => {
        focusPane(nextPaneId);
      }, 0);
    }
  }, [removeTerminalFromScope, paneOrder, focusPane]);

  const requestCloseTerminal = useCallback(async (id?: string | null) => {
    if (!id) return;
    const pane = panes[id];
    if (!pane) return;

    if (isPathLikeTitle(pane.dynamicTitle)) {
      removeTerminal(id);
      return;
    }

    // If the tmux window is currently sitting at a shell prompt, close directly.
    // If we cannot determine this confidently, fall back to confirmation.
    if (pane.tmuxWindowName) {
      try {
        const response = await systemApi.listTmuxWindows(workspaceId);
        const tmuxWindow = response.windows.find((window) =>
          window.name === pane.tmuxWindowName ||
          window.name === pane.label ||
          String(window.index) === pane.tmuxWindowName
        );
        if (tmuxWindow && isIdleShellCommand(tmuxWindow.current_command)) {
          removeTerminal(id);
          return;
        }
      } catch (error) {
        console.warn("Failed to inspect terminal foreground command before close", error);
      }
    }

    if (!pane.tmuxWindowName) {
      removeTerminal(id);
      return;
    }

    setCloseConfirmPaneId(id);
  }, [panes, removeTerminal, workspaceId]);

  const confirmCloseTerminal = useCallback(() => {
    if (!closeConfirmPaneId) return;
    removeTerminal(closeConfirmPaneId);
    setCloseConfirmPaneId(null);
  }, [closeConfirmPaneId, removeTerminal]);

  const cancelCloseTerminal = useCallback(() => {
    setCloseConfirmPaneId(null);
  }, []);

  useEffect(() => {
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

  const pinPaneToCanvas = useCallback(async (id?: string | null) => {
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
        createCanvasSnapshot(document.tldrawDocument, createDefaultCanvasSession()),
        createCanvasTerminalShapeProps({
          contextScope,
          workspaceId,
          projectName: workspaceInfo.projectName,
          workspaceName: workspaceInfo.workspaceName,
          localPath: workspaceInfo.localPath,
          terminalName: pane.label,
          tmuxWindowName: pane.tmuxWindowName,
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
  }, [isProjectContext, panes, pinnedPaneKeys, workspaceId, workspaceInfo]);

  const splitTerminal = useCallback((id: string, direction: "row" | "column", agent?: TerminalPaneAgent) => {
    const newPaneId = isCodeReview
      ? splitCodeReviewTerminal(workspaceId, id, direction, agent)
      : isProjectWiki
      ? splitProjectWikiTerminal(workspaceId, id, direction, agent)
      : splitTerminalInStore(workspaceId, id, direction, terminalTabId, agent);
    if (newPaneId) {
      setActivePaneId(newPaneId);
      window.setTimeout(() => {
        terminalRefsMap.current.get(newPaneId)?.focus();
      }, 0);
    }
    return newPaneId;
  }, [workspaceId, isCodeReview, isProjectWiki, splitCodeReviewTerminal, splitProjectWikiTerminal, splitTerminalInStore, terminalTabId]);

  const splitFocusedTerminal = useCallback((direction: "row" | "column") => {
    const paneId = getFocusedPaneId();
    if (!paneId) return;
    splitTerminal(paneId, direction);
  }, [getFocusedPaneId, splitTerminal]);

  const onToggleMaximize = useCallback((id: string) => {
    if (isCodeReview || isProjectWiki) {
      toggleMaximizeForScope(workspaceId, id);
      return;
    }
    toggleMaximizeForScope(workspaceId, id, terminalTabId);
  }, [workspaceId, toggleMaximizeForScope, isCodeReview, isProjectWiki, terminalTabId]);

  const terminalHotkeyScopeRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleTerminalNavigationHotkey = (event: KeyboardEvent) => {
      const container = terminalHotkeyScopeRef.current;
      if (!container || container.getClientRects().length === 0) return;
      const target = event.target;
      const isTerminalEventTarget = target instanceof Node && container.contains(target);
      if (!isTerminalEventTarget || !(event.metaKey || event.ctrlKey) || event.altKey) return;

      if (!event.shiftKey && (event.key.toLowerCase() === "d" || event.code === "KeyD")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        splitFocusedTerminal("row");
        return;
      }

      if (event.shiftKey && (event.key.toLowerCase() === "d" || event.code === "KeyD")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        splitFocusedTerminal("column");
        return;
      }

      if (!event.shiftKey && (event.key.toLowerCase() === "t" || event.code === "KeyT")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onNewTerminalTab?.();
        return;
      }

      if (!event.shiftKey && (event.key.toLowerCase() === "w" || event.code === "KeyW")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        requestCloseTerminal(getFocusedPaneId());
        return;
      }

      if (event.shiftKey && (event.key.toLowerCase() === "f" || event.code === "KeyF")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const focusedPaneId = getFocusedPaneId();
        if (focusedPaneId) {
          onToggleMaximize(focusedPaneId);
        }
        return;
      }

      if (event.shiftKey && (event.key.toLowerCase() === "p" || event.code === "KeyP")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void pinPaneToCanvas(getFocusedPaneId());
        return;
      }

      if (!event.shiftKey && (event.key === "[" || event.code === "BracketLeft")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        focusPaneByOffset(-1);
        return;
      }

      if (!event.shiftKey && (event.key === "]" || event.code === "BracketRight")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        focusPaneByOffset(1);
      }
    };

    window.addEventListener("keydown", handleTerminalNavigationHotkey, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleTerminalNavigationHotkey, { capture: true });
    };
  }, [focusPaneByOffset, getFocusedPaneId, onNewTerminalTab, onToggleMaximize, pinPaneToCanvas, requestCloseTerminal, splitFocusedTerminal]);

  const splitAndRunAgent = useCallback((id: string, direction: "row" | "column", command: string, agent: TerminalPaneAgent) => {
    const newPaneId = splitTerminal(id, direction, agent);
    if (!newPaneId) return;
    pendingCommandsRef.current.set(newPaneId, command.trim() + "\r");
    setSplitMenuKey(null);
  }, [splitTerminal]);

  const handleSplitMenuEnter = useCallback((key: string) => {
    if (splitMenuTimeoutRef.current) {
      clearTimeout(splitMenuTimeoutRef.current);
    }
    setSplitMenuKey(key);
  }, []);

  const handleSplitMenuLeave = useCallback(() => {
    splitMenuTimeoutRef.current = setTimeout(() => {
      setSplitMenuKey(null);
    }, 120);
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    // Only show context menu when right-clicking inside the terminal mosaic container
    // but not on toolbar buttons or other interactive elements
    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest(".terminal-mosaic-toolbar")) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const handleContextMenuAction = useCallback((action: string) => {
    setContextMenu(null);
    const focusedPaneId = getFocusedPaneId();
    switch (action) {
      case "new-tab":
        onNewTerminalTab?.();
        break;
      case "paste": {
        const termRef = focusedPaneId ? terminalRefsMap.current.get(focusedPaneId) : null;
        if (termRef) {
          void termRef.paste();
        }
        break;
      }
      case "split-horizontal":
        splitFocusedTerminal("row");
        break;
      case "split-vertical":
        splitFocusedTerminal("column");
        break;
      case "maximize":
        if (focusedPaneId) {
          onToggleMaximize(focusedPaneId);
        }
        break;
      case "pin-to-canvas":
        void pinPaneToCanvas(focusedPaneId);
        break;
      case "close":
        requestCloseTerminal(focusedPaneId);
        break;
      case "previous-panel":
        focusPaneByOffset(-1);
        break;
      case "next-panel":
        focusPaneByOffset(1);
        break;
    }
  }, [getFocusedPaneId, onNewTerminalTab, onToggleMaximize, pinPaneToCanvas, requestCloseTerminal, splitFocusedTerminal, focusPaneByOffset]);

  const focusedPane = effectiveActivePaneId ? panes[effectiveActivePaneId] : null;
  const focusedPanePinKey = focusedPane?.tmuxWindowName
    ? buildCanvasTerminalPinKey(isProjectContext ? "project" : "workspace", workspaceId, focusedPane.tmuxWindowName)
    : null;
  const isFocusedPanePinned = focusedPanePinKey ? pinnedPaneKeys.has(focusedPanePinKey) : false;

  const renderTile = useCallback((id: string, path: MosaicPath) => {
    const pane = panes[id];
    if (!pane) return <div className="p-4 text-xs text-muted-foreground">Pane not found: {id}</div>;

    const { displayTitle, toolbarAgent } = getTerminalDisplayMeta({
      baseTitle: pane.label,
      dynamicTitle: pane.dynamicTitle,
      configuredAgents,
      agent: pane.agent,
    });
    const panePinKey = pane.tmuxWindowName
      ? buildCanvasTerminalPinKey(isProjectContext ? "project" : "workspace", workspaceId, pane.tmuxWindowName)
      : null;
    const isPanePinned = panePinKey ? pinnedPaneKeys.has(panePinKey) : false;

    return (
      <MosaicWindow<string>
        path={path}
        title={displayTitle ?? ""}
        className={cn(
          maximizedId === id && "is-maximized",
          hasMultiplePanes && (effectiveActivePaneId === id ? "is-active-pane" : "is-inactive-pane"),
        )}
        onDragStart={() => setIsPaneDragging(true)}
        onDragEnd={() => setIsPaneDragging(false)}
        renderToolbar={() => {
          return (
            <div className="terminal-mosaic-toolbar group/toolbar">
              <div className="terminal-mosaic-toolbar-left">
                {displayTitle ? (
                  <TerminalTitleWithAgent
                    displayTitle={displayTitle}
                    toolbarAgent={toolbarAgent}
                    className="terminal-mosaic-title gap-1.5"
                  />
                ) : null}
                <TerminalPaneAgentStatus paneId={pane.tmuxWindowName ? `${workspaceId}:${pane.tmuxWindowName}` : pane.sessionId} contextId={workspaceId} />
              </div>

              {(actions.split || actions.maximize || actions.close) && (
              <div className="terminal-mosaic-toolbar-right">
                    <button
                      className={cn(
                        "terminal-mosaic-btn transition-opacity",
                        "opacity-0 group-hover/toolbar:opacity-100",
                        isPanePinned && "bg-accent text-primary cursor-not-allowed",
                      )}
                      onClick={() => void pinPaneToCanvas(id)}
                      title={isPanePinned ? "Already pinned to Canvas" : "Pin to Canvas (⌘⇧P)"}
                      disabled={isPanePinned}
                      aria-pressed={isPanePinned}
                    >
                      <Pin size={12} />
                    </button>
                  <div className="flex items-center gap-0.5">
                    {actions.split && (
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/toolbar:opacity-100">
                        <DropdownMenu
                          open={splitMenuKey === `${id}:row`}
                          onOpenChange={(open) => setSplitMenuKey(open ? `${id}:row` : null)}
                          modal={false}
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              className="terminal-mosaic-btn"
                              onClick={() => splitTerminal(id, "row")}
                              onMouseEnter={() => handleSplitMenuEnter(`${id}:row`)}
                              onMouseLeave={handleSplitMenuLeave}
                              title="Split Horizontal (⌘D)"
                            >
                              <Columns size={12} />
                            </button>
                          </DropdownMenuTrigger>
                          {quickOpenAgents.length > 0 && (
                            <DropdownMenuContent
                              align="start"
                              onMouseEnter={() => handleSplitMenuEnter(`${id}:row`)}
                              onMouseLeave={handleSplitMenuLeave}
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              {quickOpenAgents.map(({ agent, command }) => (
                                <DropdownMenuItem key={`row-${agent.id}`} onClick={() => splitAndRunAgent(id, "row", command, agent)}>
                                  {agent.iconType === "built-in" ? (
                                    <AgentIcon registryId={agent.id} name={agent.label} size={16} />
                                  ) : (
                                    <Bot className="size-4 text-muted-foreground" />
                                  )}
                                  <span>{agent.label}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          )}
                        </DropdownMenu>
                        <DropdownMenu
                          open={splitMenuKey === `${id}:column`}
                          onOpenChange={(open) => setSplitMenuKey(open ? `${id}:column` : null)}
                          modal={false}
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              className="terminal-mosaic-btn"
                              onClick={() => splitTerminal(id, "column")}
                              onMouseEnter={() => handleSplitMenuEnter(`${id}:column`)}
                              onMouseLeave={handleSplitMenuLeave}
                              title="Split Vertical (⌘⇧D)"
                            >
                              <Rows size={12} />
                            </button>
                          </DropdownMenuTrigger>
                          {quickOpenAgents.length > 0 && (
                            <DropdownMenuContent
                              align="start"
                              onMouseEnter={() => handleSplitMenuEnter(`${id}:column`)}
                              onMouseLeave={handleSplitMenuLeave}
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              {quickOpenAgents.map(({ agent, command }) => (
                                <DropdownMenuItem key={`column-${agent.id}`} onClick={() => splitAndRunAgent(id, "column", command, agent)}>
                                  {agent.iconType === "built-in" ? (
                                    <AgentIcon registryId={agent.id} name={agent.label} size={16} />
                                  ) : (
                                    <Bot className="size-4 text-muted-foreground" />
                                  )}
                                  <span>{agent.label}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          )}
                        </DropdownMenu>
                      </div>
                    )}
                    {(actions.maximize || actions.close) && (
                      <div className={cn("flex items-center gap-0.5 transition-opacity", maximizedId === id ? "opacity-100" : "opacity-0 group-hover/toolbar:opacity-100")}>
                    {actions.maximize && (
                      <button
                        className={cn(
                          "terminal-mosaic-btn",
                          maximizedId === id && "text-primary"
                        )}
                        onClick={() => onToggleMaximize(id)}
                        title={maximizedId === id ? "Restore" : "Maximize"}
                      >
                        {maximizedId === id ? (
                          <div className="relative size-3 flex items-center justify-center">
                            <Maximize2 size={11} className="scale-75 opacity-70" />
                            <div className="absolute inset-0 border-[1.5px] border-current rounded-[1px] scale-50 translate-x-0.5 -translate-y-0.5" />
                          </div>
                        ) : (
                          <Maximize2 size={11} />
                        )}
                      </button>
                    )}
                    {actions.close && (
                      <button
                        className="terminal-mosaic-btn terminal-mosaic-btn-close ml-1"
                        onClick={() => requestCloseTerminal(id)}
                        title="Close (⌘W)"
                      >
                        <X size={12} />
                      </button>
                    )}
                      </div>
                    )}
                  </div>
              </div>
              )}
            </div>
          );
        }}
      >
        <div
          className="terminal-mosaic-content"
          data-pane-id={id}
          onMouseDownCapture={() => setActivePaneId(id)}
          onFocusCapture={() => setActivePaneId(id)}
        >
          <Terminal
            ref={(termRef) => {
              if (termRef) {
                terminalRefsMap.current.set(id, termRef);
              } else {
                terminalRefsMap.current.delete(id);
              }
            }}
            sessionId={pane.sessionId}
            workspaceId={pane.workspaceId}
            tmuxWindowName={pane.tmuxWindowName}
            projectName={workspaceInfo?.projectName}
            workspaceName={workspaceInfo?.workspaceName}
            isNewPane={pane.isNewPane}
            cwd={workspaceInfo?.localPath}
            projectRootPath={projects.find((project) =>
              project.id === workspaceId || project.workspaces.some((workspace) => workspace.id === workspaceId)
            )?.mainFilePath}
            onTitleChange={(title) => {
              const detectedAgent = resolveAgentForTitle(title, configuredAgents);
              if (isCodeReview || isProjectWiki) {
                setDynamicTitleForScope(workspaceId, id, title);
                if (detectedAgent) {
                  setPaneAgentForScope(workspaceId, id, detectedAgent);
                }
                return;
              }
              setDynamicTitleForScope(workspaceId, id, title, terminalTabId);
              if (detectedAgent) {
                setPaneAgentForScope(workspaceId, id, detectedAgent, terminalTabId);
              }
            }}
            onSessionReady={() => {
              readyPanesRef.current.add(id);
              if (isCodeReview) {
                markCodeReviewPaneAttached(workspaceId, id);
              } else if (isProjectWiki) {
                markProjectWikiPaneAttached(workspaceId, id);
              } else {
                markPaneAttached(workspaceId, id, terminalTabId);
              }
              const cmd = pendingCommandsRef.current.get(id);
              if (cmd) {
                pendingCommandsRef.current.delete(id);
                terminalRefsMap.current.get(id)?.sendText(cmd);
              }
            }}
          />
        </div>
      </MosaicWindow>
    );
  }, [
    panes,
    splitTerminal,
    splitAndRunAgent,
    requestCloseTerminal,
    workspaceInfo,
    maximizedId,
    workspaceId,
    onToggleMaximize,
    setDynamicTitleForScope,
    setPaneAgentForScope,
    actions,
    configuredAgents,
    projects,
    isCodeReview,
    isProjectWiki,
    markCodeReviewPaneAttached,
    markPaneAttached,
    markProjectWikiPaneAttached,
    terminalTabId,
    splitMenuKey,
    quickOpenAgents,
    handleSplitMenuEnter,
    handleSplitMenuLeave,
    hasMultiplePanes,
    effectiveActivePaneId,
    isProjectContext,
    pinnedPaneKeys,
    pinPaneToCanvas,
  ]);

  // Wait for workspace to be ready before rendering any Terminal components
  // This prevents duplicate tmux window creation during initialization
  if (isProjectsLoading || !workspaceExists || !workspaceReady) {
    return (
      <div className={cn("terminal-grid-container flex items-center justify-center", className)}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading workspace...</span>
        </div>
      </div>
    );
  }

  if (!hasPanes || !layout) {
    const emptyTitle = isProjectWiki ? "Generate Project Wiki" : undefined;
    const emptyLabel = isProjectWiki ? "Add Project Wiki Terminal" : "Initialize Workspace";
    const emptyHint = isProjectWiki ? "Run wiki generation from the Wiki tab" : "Click to add your first terminal session";
    return (
      <div className={cn("terminal-grid-container flex items-center justify-center", className)}>
        <button
          className="flex flex-col items-center gap-4 hover:text-foreground transition-all duration-300 group"
          onClick={() => addTerminal(emptyTitle)}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-0 group-hover:scale-150 transition-transform duration-500" />
            <div className="relative size-14 rounded-2xl bg-sidebar border border-border flex items-center justify-center group-hover:border-primary/50 group-hover:shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)] transition-all duration-300">
              <Plus className="size-6 text-muted-foreground group-hover:text-primary group-hover:rotate-90 transition-all duration-500" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-semibold tracking-tight text-muted-foreground group-hover:text-foreground transition-colors">
              {emptyLabel}
            </span>
            <span className="text-[11px] text-muted-foreground/60">
              {emptyHint}
            </span>
          </div>
        </button>
      </div>
    );
  }

  const closeConfirmPane = closeConfirmPaneId ? panes[closeConfirmPaneId] : null;
  const closeConfirmTitle = closeConfirmPane?.dynamicTitle ?? closeConfirmPane?.label ?? "Terminal";

  return (
    <>
      <div
        ref={terminalHotkeyScopeRef}
        tabIndex={-1}
        className={cn("terminal-mosaic-container", className)}
        data-maximized-id={maximizedId || undefined}
        data-pane-dragging={isPaneDragging ? "true" : undefined}
        onContextMenu={handleContextMenu}
      >
        <Mosaic<string>
          renderTile={renderTile}
          value={layout}
          onChange={onChange}
          className="atmos-mosaic-theme"
        />

        <Dialog
        open={!!closeConfirmPaneId}
        onOpenChange={(open) => {
          if (!open) cancelCloseTerminal();
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              confirmCloseTerminal();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancelCloseTerminal();
            }
          }}
        >
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle>Close terminal?</DialogTitle>
            <DialogDescription className="max-w-none text-left leading-relaxed">
              Close <span className="font-medium text-foreground">{closeConfirmTitle}</span>? This will terminate the current terminal session.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelCloseTerminal} className="cursor-pointer">
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmCloseTerminal} className="cursor-pointer" autoFocus>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    <DropdownMenu
      open={!!contextMenu}
      onOpenChange={(open) => {
        if (!open) setContextMenu(null);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden
          className="fixed size-0 pointer-events-none"
          style={{
            left: contextMenu?.x ?? -9999,
            top: contextMenu?.y ?? -9999,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-56">
        <DropdownMenuItem onClick={() => handleContextMenuAction("new-tab")} className="cursor-pointer">
          <SquareTerminal className="size-4 mr-2 text-muted-foreground" />
          <span>New Terminal Tab</span>
          <DropdownMenuShortcut>⌘T</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleContextMenuAction("paste")} className="cursor-pointer">
          <ClipboardPaste className="size-4 mr-2 text-muted-foreground" />
          <span>Paste</span>
          <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleContextMenuAction("pin-to-canvas")}
          className={cn("cursor-pointer", isFocusedPanePinned && "bg-accent text-primary")}
          disabled={isFocusedPanePinned}
        >
          <Pin className="size-4 mr-2 text-muted-foreground" />
          <span>{isFocusedPanePinned ? "Pinned to Canvas" : "Pin to Canvas"}</span>
          <DropdownMenuShortcut>⌘⇧P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleContextMenuAction("previous-panel")} className="cursor-pointer">
          <ArrowLeft className="size-4 mr-2 text-muted-foreground" />
          <span>Previous Panel</span>
          <DropdownMenuShortcut>⌘[</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleContextMenuAction("next-panel")} className="cursor-pointer">
          <ArrowRight className="size-4 mr-2 text-muted-foreground" />
          <span>Next Panel</span>
          <DropdownMenuShortcut>⌘]</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleContextMenuAction("split-horizontal")} className="cursor-pointer">
          <Columns className="size-4 mr-2 text-muted-foreground" />
          <span>Split Horizontal</span>
          <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleContextMenuAction("split-vertical")} className="cursor-pointer">
          <Rows className="size-4 mr-2 text-muted-foreground" />
          <span>Split Vertical</span>
          <DropdownMenuShortcut>⌘⇧D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleContextMenuAction("maximize")} className="cursor-pointer">
          {maximizedId ? (
            <>
              <Minimize className="size-4 mr-2 text-muted-foreground" />
              <span>Restore Terminal</span>
              <DropdownMenuShortcut>⌘⇧F</DropdownMenuShortcut>
            </>
          ) : (
            <>
              <Maximize className="size-4 mr-2 text-muted-foreground" />
              <span>Maximize Terminal</span>
              <DropdownMenuShortcut>⌘⇧F</DropdownMenuShortcut>
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleContextMenuAction("close")} className="cursor-pointer text-destructive focus:text-destructive">
          <X className="size-4 mr-2" />
          <span>Close Terminal</span>
          <DropdownMenuShortcut>⌘W</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </>
  );
});

TerminalGrid.displayName = "TerminalGrid";
