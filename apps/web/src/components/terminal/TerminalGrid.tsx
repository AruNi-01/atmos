"use client";

// Suppress React 19 ref warnings from react-mosaic-component
// This must be imported before react-mosaic-component
import "@/lib/suppress-react19-ref-warning";

import React, { useCallback, useEffect } from "react";
import {
  Mosaic,
  MosaicNode,
  MosaicPath,
} from "react-mosaic-component";

import { cn } from "@workspace/ui";
import type { TerminalRef } from "./Terminal";
import type { TerminalPaneAgent } from "./types";
import { isPathLikeTitle } from "./terminal-title";
import { systemApi } from "@/api/rest-api";
import { useTerminalStore, FIXED_TERMINAL_TAB_VALUE } from "@/hooks/use-terminal-store";
import { useTerminalSplitPrefs } from "@/hooks/use-terminal-split-prefs";
import { useProjectStore } from "@/hooks/use-project-store";
import { buildCanvasTerminalPinKey } from "@/components/canvas/canvas-terminal-shape";
import {
  TerminalMosaicWorkspacePaneWindow,
} from "./terminal-mosaic-workspace-pane-window";
import { TerminalMosaicScopedPaneWindow } from "./terminal-mosaic-scoped-pane-window";
import {
  TerminalGridContextMenu,
  type TerminalGridContextMenuAction,
} from "./TerminalGridContextMenu";
import {
  DEFAULT_TOOLBAR_ACTIONS,
  flattenMosaicLayout,
  isIdleShellCommand,
  type TerminalGridHandle,
  type TerminalGridProps,
} from "./terminal-grid-utils";
import { TerminalGridCloseConfirmDialog } from "./terminal-grid-close-confirm-dialog";
import { TerminalGridEmptyState, TerminalGridLoadingState } from "./terminal-grid-states";
import { useTerminalGridCanvasPins } from "./use-terminal-grid-canvas-pins";
import { useTerminalGridHotkeys } from "./use-terminal-grid-hotkeys";

import "react-mosaic-component/react-mosaic-component.css";
import "./terminal-grid.css";

export type { TerminalGridHandle, TerminalToolbarActions } from "./terminal-grid-utils";

export const TerminalGrid = React.forwardRef<TerminalGridHandle, TerminalGridProps>(({ workspaceId, className, terminalTabId, quickOpenAgents = [], scope = "default", toolbarActions, isProjectContext = false, onNewTerminalTab }, ref) => {
  // Track terminal refs for each pane to call destroy on close
  const terminalRefsMap = React.useRef<Map<string, TerminalRef>>(new Map());
  // Pending commands to send when terminal session becomes ready (createAndRunTerminal flow)
  const pendingCommandsRef = React.useRef<Map<string, string>>(new Map());
  // Track panes whose session has already become ready, so we know whether
  // to call sendText directly or queue a pending command for onSessionReady.
  const readyPanesRef = React.useRef<Set<string>>(new Set());
  const [splitMenuKey, setSplitMenuKey] = React.useState<string | null>(null);
  const [contextSplitSubmenu, setContextSplitSubmenu] = React.useState<"row" | "column" | null>(null);
  const [isPaneDragging, setIsPaneDragging] = React.useState(false);
  const [activePaneId, setActivePaneId] = React.useState<string | null>(null);
  const [closeConfirmPaneId, setCloseConfirmPaneId] = React.useState<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const splitMenuTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextSplitSubmenuTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const hydrateTerminalSplitPrefs = useTerminalSplitPrefs((state) => state.hydrate);
  const useLastSplitAgentOnSplit = useTerminalSplitPrefs((state) => state.useLastSplitAgentOnSplit);
  const lastSplitAgentId = useTerminalSplitPrefs((state) => state.lastSplitAgentId);
  const rememberLastSplitAgent = useTerminalSplitPrefs((state) => state.rememberLastSplitAgent);

  React.useEffect(() => {
    hydrateTerminalSplitPrefs();
  }, [hydrateTerminalSplitPrefs]);

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

  const { pinnedPaneKeys, pinPaneToCanvas } = useTerminalGridCanvasPins({
    configuredAgents,
    isProjectContext,
    panes,
    terminalTabId,
    workspaceId,
    workspaceInfo,
  });

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
    focusPaneByTmuxWindowName: (tmuxWindowName: string) => {
      const trimmed = tmuxWindowName.trim();
      if (!trimmed) return false;
      const paneId = getPaneId(workspaceId, trimmed);
      if (!paneId || !panes[paneId]) return false;
      focusPane(paneId);
      return true;
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

  const splitAndRunAgentWithRemember = useCallback(
    (id: string, direction: "row" | "column", command: string, agent: TerminalPaneAgent) => {
      rememberLastSplitAgent(agent.id);
      const newPaneId = splitTerminal(id, direction, agent);
      if (!newPaneId) return;
      pendingCommandsRef.current.set(newPaneId, command.trim() + "\r");
      setSplitMenuKey(null);
    },
    [rememberLastSplitAgent, splitTerminal],
  );

  const performSplit = useCallback(
    (id: string, direction: "row" | "column") => {
      if (useLastSplitAgentOnSplit && lastSplitAgentId) {
        const match = quickOpenAgents.find(({ agent }) => agent.id === lastSplitAgentId);
        if (match) {
          splitAndRunAgentWithRemember(id, direction, match.command, match.agent);
          return;
        }
      }
      splitTerminal(id, direction);
    },
    [lastSplitAgentId, quickOpenAgents, splitAndRunAgentWithRemember, splitTerminal, useLastSplitAgentOnSplit],
  );

  const splitFocusedTerminal = useCallback(
    (direction: "row" | "column") => {
      const paneId = getFocusedPaneId();
      if (!paneId) return;
      performSplit(paneId, direction);
    },
    [getFocusedPaneId, performSplit],
  );

  const onToggleMaximize = useCallback((id: string) => {
    if (isCodeReview || isProjectWiki) {
      toggleMaximizeForScope(workspaceId, id);
      return;
    }
    toggleMaximizeForScope(workspaceId, id, terminalTabId);
  }, [workspaceId, toggleMaximizeForScope, isCodeReview, isProjectWiki, terminalTabId]);

  const terminalHotkeyScopeRef = React.useRef<HTMLDivElement | null>(null);

  useTerminalGridHotkeys({
    terminalHotkeyScopeRef,
    focusPaneByOffset,
    getFocusedPaneId,
    onNewTerminalTab,
    onToggleMaximize,
    pinPaneToCanvas,
    requestCloseTerminal,
    splitFocusedTerminal,
  });

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

  const handleContextSplitSubmenuEnter = useCallback((key: "row" | "column") => {
    if (quickOpenAgents.length === 0) return;
    if (contextSplitSubmenuTimeoutRef.current) {
      clearTimeout(contextSplitSubmenuTimeoutRef.current);
    }
    setContextSplitSubmenu(key);
  }, [quickOpenAgents.length]);

  const handleContextSplitSubmenuLeave = useCallback(() => {
    contextSplitSubmenuTimeoutRef.current = setTimeout(() => {
      setContextSplitSubmenu(null);
    }, 120);
  }, []);

  const handleContextSplitWithAgent = useCallback(
    (direction: "row" | "column", command: string, agent: TerminalPaneAgent) => {
      setContextMenu(null);
      setContextSplitSubmenu(null);
      const focusedPaneId = getFocusedPaneId();
      if (!focusedPaneId) return;
      splitAndRunAgentWithRemember(focusedPaneId, direction, command, agent);
    },
    [getFocusedPaneId, splitAndRunAgentWithRemember],
  );

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    // Only show context menu when right-clicking inside the terminal mosaic container
    // but not on toolbar buttons or other interactive elements
    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest(".terminal-mosaic-toolbar")) return;
    event.preventDefault();
    setContextSplitSubmenu(null);
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const handleContextMenuAction = useCallback((action: TerminalGridContextMenuAction) => {
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

    if (!isCodeReview && !isProjectWiki) {
      return (
        <TerminalMosaicWorkspacePaneWindow
          id={id}
          path={path}
          pane={pane}
          workspaceId={workspaceId}
          terminalTabId={terminalTabId ?? FIXED_TERMINAL_TAB_VALUE}
          workspaceInfo={workspaceInfo}
          projects={projects}
          configuredAgents={configuredAgents}
          isProjectContext={isProjectContext}
          pinnedPaneKeys={pinnedPaneKeys}
          maximizedId={maximizedId}
          effectiveActivePaneId={effectiveActivePaneId}
          hasMultiplePanes={hasMultiplePanes}
          actions={actions}
          quickOpenAgents={quickOpenAgents}
          splitMenuKey={splitMenuKey}
          setSplitMenuKey={setSplitMenuKey}
          onSplitPane={performSplit}
          splitAndRunAgent={splitAndRunAgentWithRemember}
          handleSplitMenuEnter={handleSplitMenuEnter}
          handleSplitMenuLeave={handleSplitMenuLeave}
          pinPaneToCanvas={pinPaneToCanvas}
          onToggleMaximize={onToggleMaximize}
          requestCloseTerminal={requestCloseTerminal}
          setActivePaneId={setActivePaneId}
          setIsPaneDragging={setIsPaneDragging}
          terminalRefsMap={terminalRefsMap}
          readyPanesRef={readyPanesRef}
          pendingCommandsRef={pendingCommandsRef}
          markPaneAttached={markPaneAttached}
        />
      );
    }

    return (
      <TerminalMosaicScopedPaneWindow
        id={id}
        path={path}
        pane={pane}
        workspaceId={workspaceId}
        workspaceInfo={workspaceInfo}
        projects={projects}
        configuredAgents={configuredAgents}
        isProjectContext={isProjectContext}
        pinnedPaneKeys={pinnedPaneKeys}
        maximizedId={maximizedId}
        effectiveActivePaneId={effectiveActivePaneId}
        hasMultiplePanes={hasMultiplePanes}
        actions={actions}
        quickOpenAgents={quickOpenAgents}
        splitMenuKey={splitMenuKey}
        setSplitMenuKey={setSplitMenuKey}
        onSplitPane={performSplit}
        splitAndRunAgent={splitAndRunAgentWithRemember}
        handleSplitMenuEnter={handleSplitMenuEnter}
        handleSplitMenuLeave={handleSplitMenuLeave}
        pinPaneToCanvas={pinPaneToCanvas}
        onToggleMaximize={onToggleMaximize}
        requestCloseTerminal={requestCloseTerminal}
        setActivePaneId={setActivePaneId}
        setIsPaneDragging={setIsPaneDragging}
        terminalRefsMap={terminalRefsMap}
        readyPanesRef={readyPanesRef}
        pendingCommandsRef={pendingCommandsRef}
        setDynamicTitle={setDynamicTitleForScope}
        setPaneAgent={setPaneAgentForScope}
        markPaneAttached={isCodeReview ? markCodeReviewPaneAttached : markProjectWikiPaneAttached}
      />
    );
  }, [
    panes,
    performSplit,
    splitAndRunAgentWithRemember,
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
    return <TerminalGridLoadingState className={className} />;
  }

  if (!hasPanes || !layout) {
    return (
      <TerminalGridEmptyState
        className={className}
        isProjectWiki={isProjectWiki}
        onAddTerminal={addTerminal}
      />
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

        <TerminalGridCloseConfirmDialog
          open={!!closeConfirmPaneId}
          title={closeConfirmTitle}
          onCancel={cancelCloseTerminal}
          onConfirm={confirmCloseTerminal}
        />
    </div>

    <TerminalGridContextMenu
      contextMenu={contextMenu}
      contextSplitSubmenu={contextSplitSubmenu}
      quickOpenAgents={quickOpenAgents}
      isFocusedPanePinned={isFocusedPanePinned}
      isAnyPaneMaximized={!!maximizedId}
      onOpenChange={(open) => {
        if (!open) {
          setContextMenu(null);
          setContextSplitSubmenu(null);
        }
      }}
      onAction={handleContextMenuAction}
      onContextSplitSubmenuEnter={handleContextSplitSubmenuEnter}
      onContextSplitSubmenuLeave={handleContextSplitSubmenuLeave}
      onContextSplitWithAgent={handleContextSplitWithAgent}
    />
  </>
  );
});

TerminalGrid.displayName = "TerminalGrid";
