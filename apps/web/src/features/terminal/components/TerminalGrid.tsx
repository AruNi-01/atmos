"use client";

import React, { useCallback, useEffect } from "react";

import { cn } from "@workspace/ui";
import type { TerminalRef } from "./Terminal";
import type { TerminalLayoutNode, TerminalPaneAgent } from "../types/index";
import { agentHooksApi, systemApi } from "@/api/rest-api";
import { useTerminalStore, FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/store/use-terminal-store";
import { useTerminalSplitPrefsStore } from "@/features/settings/store/terminal-split-prefs-store";
import { resolveDefaultSplitAgent } from "@/features/terminal/lib/terminal-split-prefs";
import {
  useProjects,
  useProjectsLoading,
} from "@/features/project/hooks/use-project-bootstrap-query";
import { buildCanvasTerminalPinKey } from "@/features/canvas/lib/canvas-terminal-shape";
import {
  TerminalWorkspacePane,
} from "./TerminalWorkspacePane";
import { TerminalScopedPane } from "./TerminalScopedPane";
import { TerminalSplitView } from "./TerminalSplitView";
import type { TerminalAgentInputOverlayHandle } from "./TerminalAgentInputOverlay";
import type { SpawnTerminalRequest } from "../hooks/use-terminal-side-chats";
import {
  TerminalGridContextMenu,
  type TerminalGridContextMenuAction,
} from "./TerminalGridContextMenu";
import {
  DEFAULT_TOOLBAR_ACTIONS,
  flattenTerminalLayout,
  isTerminalPaneNonIdle,
  type TerminalGridHandle,
  type TerminalGridProps,
} from "../lib/terminal-grid-utils";
import { getTerminalCloseConfirmName } from "../lib/terminal-close-confirm-name";
import { TerminalGridCloseConfirmDialog } from "./terminal-grid-close-confirm-dialog";
import { TerminalGridEmptyState, TerminalGridLoadingState } from "./terminal-grid-states";
import { useTerminalGridCanvasPins } from "../hooks/use-terminal-grid-canvas-pins";
import { useTerminalGridHotkeys } from "../hooks/use-terminal-grid-hotkeys";
import { useContestedCliOwners } from "../hooks/use-contested-cli-owners";
import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";
import { useAgentAttentionSummaryStore } from "@/features/agent/store/agent-attention-summary-store";
import { useAgentHooksStore } from "@/features/agent/store/agent-hooks-store";
import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";
import {
  toPendingTerminalRun,
  useTerminalAgentTuiFollowUp,
  type PendingTerminalRun,
} from "../hooks/use-terminal-agent-tui-follow-up";

import "./terminal-grid.css";

export type { TerminalGridHandle, TerminalToolbarActions } from "../lib/terminal-grid-utils";

function isRestorableTerminalFocusElement(element: HTMLElement): boolean {
  const tagName = element.tagName;
  return element.isContentEditable || tagName === "TEXTAREA" || tagName === "INPUT";
}

export const TerminalGrid = React.forwardRef<TerminalGridHandle, TerminalGridProps>(({ workspaceId, className, terminalTabId, quickOpenAgents = [], scope = "default", toolbarActions, isProjectContext = false, onNewTerminalTab, onTerminalPaneClosed, isSurfaceActive = true }, ref) => {
  // Track terminal refs for each pane to call destroy on close
  const terminalRefsMap = React.useRef<Map<string, TerminalRef>>(new Map());
  const agentInputOverlayRefsMap = React.useRef<Map<string, TerminalAgentInputOverlayHandle>>(new Map());
  // Pending runs to deliver when terminal session becomes ready (createAndRunTerminal flow)
  const pendingRunsRef = React.useRef<Map<string, PendingTerminalRun>>(new Map());
  // Track panes whose session has already become ready, so we know whether
  // to call sendText directly or queue a pending command for onSessionReady.
  const readyPanesRef = React.useRef<Set<string>>(new Set());
  const [splitMenuKey, setSplitMenuKey] = React.useState<string | null>(null);
  const [contextSplitSubmenu, setContextSplitSubmenu] = React.useState<"row" | "column" | null>(null);
  const [isPaneDragging, setIsPaneDragging] = React.useState(false);
  const [activePaneId, setActivePaneId] = React.useState<string | null>(null);
  const [closeConfirmPaneId, setCloseConfirmPaneId] = React.useState<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  // Body-portal context menu must not survive warm/inactive surfaces.
  React.useEffect(() => {
    if (isSurfaceActive) return;
    setContextMenu(null);
    setContextSplitSubmenu(null);
    setSplitMenuKey(null);
  }, [isSurfaceActive]);
  const splitMenuTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextSplitSubmenuTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalHotkeyScopeRef = React.useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = React.useRef<HTMLElement | null>(null);
  const { deliverPendingRun } = useTerminalAgentTuiFollowUp(terminalRefsMap);

  const queuePendingRun = useCallback(
    (
      paneId: string,
      command: string,
      options?: { agentId?: string; tuiFollowUpPrompt?: string; execute?: boolean },
    ) => {
      const run = toPendingTerminalRun(command, {
        agentId: options?.agentId,
        tuiFollowUpPrompt: options?.tuiFollowUpPrompt,
      });
      pendingRunsRef.current.set(
        paneId,
        options?.execute === false ? { ...run, execute: false } : run,
      );
    },
    [],
  );

  const deliverPendingRunForPane = useCallback(
    (paneId: string) => {
      const run = pendingRunsRef.current.get(paneId);
      if (!run) return;
      pendingRunsRef.current.delete(paneId);
      deliverPendingRun(paneId, run);
    },
    [deliverPendingRun],
  );

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
  const contestedOwners = useContestedCliOwners();

  const loadTerminalSplitPrefs = useTerminalSplitPrefsStore((state) => state.loadSettings);

  React.useEffect(() => {
    void loadTerminalSplitPrefs();
  }, [loadTerminalSplitPrefs]);

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
    setOscTitle,
    setPaneAgent,
    markPaneAttached,
    setPaneCustomLabel,
    setPaneTitleFlags,
    getProjectWikiPanes,
    getProjectWikiLayout,
    setProjectWikiLayout,
    addProjectWikiTerminal,
    removeProjectWikiTerminal,
    splitProjectWikiTerminal,
    initProjectWikiWorkspace,
    getProjectWikiPaneIdByTmuxWindowName,
    setProjectWikiDynamicTitle,
    setProjectWikiOscTitle,
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
    setCodeReviewOscTitle,
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

  const projects = useProjects();
  const isProjectsLoading = useProjectsLoading();

  // Look up project and workspace info for human-readable naming.
  // Extra center spaces share the host workspace/project path (cwd, git, files).
  const workspaceInfo = (() => {
    const hostId = hostIdFromCenterKey(workspaceId);
    for (const project of projects) {
      if (project.id === hostId) {
        return {
          projectName: project.name,
          workspaceName: "Main",
          localPath: project.mainFilePath,
        };
      }
      const workspace = project.workspaces.find((row) => row.id === hostId);
      if (workspace) {
        return {
          projectName: project.name,
          // tmux session names must use the stable workspace handle (`name`),
          // not the mutable display label. Display names can diverge after rename
          // and cause reattach to open a brand-new empty shell.
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
    () => flattenTerminalLayout(layout).filter((paneId) => Boolean(panes[paneId])),
    [layout, panes],
  );
  const hasMultiplePanes = paneOrder.length > 1;
  const effectiveActivePaneId = activePaneId && paneOrder.includes(activePaneId)
    ? activePaneId
    : paneOrder[0] ?? null;

  const setActivePaneIdWithAttention = useCallback(
    (paneId: string | null) => {
      setActivePaneId(paneId);
      // Mirror into the store so center-stage tab titles can follow the active pane.
      if (!isProjectWiki && !isCodeReview) {
        useTerminalStore.getState().setActivePaneId(
          workspaceId,
          paneId,
          terminalTabId ?? FIXED_TERMINAL_TAB_VALUE,
        );
      }
      if (!paneId) return;
      const pane = panes[paneId];
      if (!pane) return;
      const stablePaneId = pane.tmuxWindowName
        ? `${hostIdFromCenterKey(workspaceId)}:${pane.tmuxWindowName}`
        : pane.sessionId;
      useAgentAttentionStore.getState().notifyPaneFocused(stablePaneId);
    },
    [isCodeReview, isProjectWiki, panes, terminalTabId, workspaceId],
  );

  const focusPane = useCallback((paneId: string | undefined | null) => {
    if (!paneId || !panes[paneId]) return;
    setActivePaneIdWithAttention(paneId);
    window.setTimeout(() => {
      terminalRefsMap.current.get(paneId)?.focus();
    }, 0);
  }, [panes, setActivePaneIdWithAttention]);

  const rememberGridFocus = React.useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement) || !isRestorableTerminalFocusElement(target)) return;
    lastFocusedElementRef.current = target;
  }, []);

  const restoreLastFocusedElement = React.useCallback(() => {
    const container = terminalHotkeyScopeRef.current;
    const element = lastFocusedElementRef.current;
    if (!container || !element || !document.contains(element) || !container.contains(element)) {
      return false;
    }
    if (!isRestorableTerminalFocusElement(element)) return false;

    const paneElement = element.closest<HTMLElement>("[data-pane-id]");
    const paneId = paneElement?.dataset.paneId ?? null;
    window.setTimeout(() => {
      const currentContainer = terminalHotkeyScopeRef.current;
      if (!currentContainer || !document.contains(element) || !currentContainer.contains(element)) {
        return;
      }

      if (element.isContentEditable && paneId) {
        const overlayRef = agentInputOverlayRefsMap.current.get(paneId);
        if (overlayRef) {
          overlayRef.focus();
          return;
        }
      }

      element.focus({ preventScroll: true });
    }, 0);

    return true;
  }, []);

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

  const spawnTerminalWithRun = useCallback((request: SpawnTerminalRequest) => {
    // /spawn always opens a fresh pane (never reuses), then sets the custom
    // title "<prompt head> · By Spawn" and queues the reused-context run.
    // We intentionally do NOT touch the title flags: like Rename terminal,
    // keepAgentName/keepCwd default to on, so the display becomes
    // "<title> · <agent>" (or "<title> · <cwd>" when no agent is running).
    const paneId = addTerminal(request.agent.label, request.agent);
    if (!paneId) return;
    const tabId = terminalTabId ?? FIXED_TERMINAL_TAB_VALUE;
    setPaneCustomLabel(workspaceId, paneId, request.title, tabId);
    queuePendingRun(paneId, request.launchCommand, {
      agentId: request.agentId,
      tuiFollowUpPrompt: request.tuiFollowUpPrompt,
    });
  }, [addTerminal, queuePendingRun, setPaneCustomLabel, terminalTabId, workspaceId]);

  const setPaneAgentForCurrentGrid = useCallback((paneId: string, agent: TerminalPaneAgent) => {
    if (isCodeReview) {
      setCodeReviewPaneAgent(workspaceId, paneId, agent);
      return;
    }
    if (isProjectWiki) {
      setProjectWikiPaneAgent(workspaceId, paneId, agent);
      return;
    }
    setPaneAgent(workspaceId, paneId, agent, terminalTabId);
  }, [
    isCodeReview,
    isProjectWiki,
    setCodeReviewPaneAgent,
    setPaneAgent,
    setProjectWikiPaneAgent,
    terminalTabId,
    workspaceId,
  ]);

  const clearAgentHookSessionForPane = useCallback((pane: { tmuxWindowName?: string | null }) => {
    const windowName = pane.tmuxWindowName;
    if (!windowName || !workspaceId) return;
    const stablePaneId = `${hostIdFromCenterKey(workspaceId)}:${windowName}`;
    useAgentAttentionStore.getState().clearPane(stablePaneId);
    useAgentAttentionSummaryStore.getState().clearPane(stablePaneId);
    void agentHooksApi
      .clearAttention({ stablePaneId, dismissSummary: true })
      .catch((error) => {
        console.warn("[TerminalGrid] Failed to dismiss attention summary on pane close:", error);
      });
    void useAgentHooksStore.getState().removeSession(stablePaneId);
  }, [workspaceId]);

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
    createAndRunTerminal: async ({ label, command, agent, agentId, tuiFollowUpPrompt }) => {
      const runOptions = { agentId: agent?.id ?? agentId, tuiFollowUpPrompt };
      // If there's exactly one fresh default pane (no agent, no pending command),
      // reuse it directly instead of creating a second terminal window.
      const currentPanes = Object.entries(panes);
      if (currentPanes.length === 1) {
        const [existingId, existingPane] = currentPanes[0];
        if (!existingPane.agent && !pendingRunsRef.current.has(existingId)) {
          if (agent) {
            setPaneAgentForCurrentGrid(existingId, agent);
          }
          const termRef = terminalRefsMap.current.get(existingId);
          // Only send immediately when the underlying tmux session has reported
          // input-ready. Otherwise the websocket is still attaching and the
          // input would be silently dropped — queue it for onSessionReady.
          if (termRef && readyPanesRef.current.has(existingId)) {
            deliverPendingRun(existingId, toPendingTerminalRun(command, runOptions));
          } else {
            queuePendingRun(existingId, command, runOptions);
          }
          return;
        }
      }
      const paneId = addTerminal(label, agent);
      queuePendingRun(paneId, command, runOptions);
    },
    createOrFocusAndRunTerminal: async ({ label, command, agent, agentId, tuiFollowUpPrompt }) => {
      const runOptions = { agentId: agent?.id ?? agentId, tuiFollowUpPrompt };
      const existingPaneId = getPaneIdByLabelOrWindowName(label);
      if (existingPaneId) {
        if (agent && !panes[existingPaneId]?.agent) {
          setPaneAgentForCurrentGrid(existingPaneId, agent);
        }
        const termRef = terminalRefsMap.current.get(existingPaneId);
        const run = toPendingTerminalRun(command, runOptions);
        if (termRef && readyPanesRef.current.has(existingPaneId)) {
          deliverPendingRun(existingPaneId, run);
        } else {
          pendingRunsRef.current.set(existingPaneId, run);
        }
        return;
      }
      const paneId = addTerminal(label, agent);
      queuePendingRun(paneId, command, runOptions);
    },
    removeTerminalByTmuxWindowName: (tmuxWindowName: string) => {
      const paneId = getPaneId(workspaceId, tmuxWindowName);
      if (!paneId) return false;
      const pane = panes[paneId];
      if (!pane) return false;
      const terminalRef = terminalRefsMap.current.get(paneId);
      if (terminalRef) {
        terminalRef.destroy();
        terminalRefsMap.current.delete(paneId);
      }
      clearAgentHookSessionForPane(pane);
      if (!isCodeReview && !isProjectWiki && onTerminalPaneClosed) {
        onTerminalPaneClosed({
          paneId,
          pane,
          terminalTabId: terminalTabId ?? FIXED_TERMINAL_TAB_VALUE,
          isLastPane: Object.keys(panes).length <= 1,
        });
        return true;
      }
      removeTerminalFromScope(paneId);
      return true;
    },
    prefillTerminal: ({ label, command, agent }) => {
      const paneId = addTerminal(label, agent);
      // Pre-fill without \r so the command is typed but not executed
      queuePendingRun(paneId, command, { execute: false });
    },
    destroyAllTerminals: () => {
      for (const terminalRef of terminalRefsMap.current.values()) {
        terminalRef.destroy();
      }
      terminalRefsMap.current.clear();
    },
    focusActivePane: () => {
      if (restoreLastFocusedElement()) {
        return;
      }
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
  }), [workspaceId, addTerminal, clearAgentHookSessionForPane, effectiveActivePaneId, focusPane, getPaneId, getPaneIdByLabelOrWindowName, isCodeReview, isProjectWiki, onTerminalPaneClosed, removeTerminalFromScope, panes, restoreLastFocusedElement, setPaneAgentForCurrentGrid, terminalTabId]);

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
  const setOscTitleForScope = isCodeReview
    ? setCodeReviewOscTitle
    : isProjectWiki
    ? setProjectWikiOscTitle
    : setOscTitle;
  const setPaneAgentForScope = isCodeReview
    ? setCodeReviewPaneAgent
    : isProjectWiki
    ? setProjectWikiPaneAgent
    : setPaneAgent;

  const onChange = useCallback((newLayout: TerminalLayoutNode<string> | null) => {
    if (isCodeReview || isProjectWiki) {
      setLayoutForScope(workspaceId, newLayout);
      return;
    }
    setLayoutForScope(workspaceId, newLayout, terminalTabId);
  }, [workspaceId, setLayoutForScope, isCodeReview, isProjectWiki, terminalTabId]);

  const removeTerminal = useCallback((id: string) => {
    const pane = panes[id];
    if (!pane) return;

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

    clearAgentHookSessionForPane(pane);

    if (!isCodeReview && !isProjectWiki && onTerminalPaneClosed) {
      onTerminalPaneClosed({
        paneId: id,
        pane,
        terminalTabId: terminalTabId ?? FIXED_TERMINAL_TAB_VALUE,
        isLastPane: paneOrder.length <= 1,
      });
      return;
    }

    removeTerminalFromScope(id);

    // Focus the next pane after removal
    if (nextPaneId) {
      // Use setTimeout to ensure the layout has updated
      window.setTimeout(() => {
        focusPane(nextPaneId);
      }, 0);
    }
  }, [clearAgentHookSessionForPane, isCodeReview, isProjectWiki, onTerminalPaneClosed, panes, removeTerminalFromScope, paneOrder, focusPane, terminalTabId]);

  const requestCloseTerminal = useCallback(async (id?: string | null) => {
    if (!id) return;
    const pane = panes[id];
    if (!pane) return;

    // No tmux identity yet → not attached; close without confirm.
    if (!pane.tmuxWindowName) {
      removeTerminal(id);
      return;
    }

    // Probe tmux foreground command. Unavailable list falls back to confirm
    // unless the title is a CMD_END cwd (see isTerminalPaneNonIdle).
    let tmuxWindows: Awaited<ReturnType<typeof systemApi.listTmuxWindows>>["windows"] | null = null;
    try {
      const response = await systemApi.listTmuxWindows(hostIdFromCenterKey(workspaceId));
      tmuxWindows = response.windows;
    } catch (error) {
      console.warn("Failed to inspect terminal foreground command before close", error);
    }

    if (!isTerminalPaneNonIdle(pane, tmuxWindows)) {
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
      setActivePaneIdWithAttention(newPaneId);
      window.setTimeout(() => {
        terminalRefsMap.current.get(newPaneId)?.focus();
      }, 0);
    }
    return newPaneId;
  }, [workspaceId, isCodeReview, isProjectWiki, splitCodeReviewTerminal, splitProjectWikiTerminal, splitTerminalInStore, terminalTabId, setActivePaneIdWithAttention]);

  const splitAndRunAgent = useCallback(
    (id: string, direction: "row" | "column", command: string, agent: TerminalPaneAgent) => {
      const newPaneId = splitTerminal(id, direction, agent);
      if (!newPaneId) return;
      pendingRunsRef.current.set(newPaneId, toPendingTerminalRun(command.trim()));
      setSplitMenuKey(null);
    },
    [splitTerminal],
  );

  const performSplit = useCallback(
    (id: string, direction: "row" | "column") => {
      // Await hydration before deciding the default agent so the first split
      // after mount does not ignore a persisted default while loaded===false.
      void (async () => {
        await useTerminalSplitPrefsStore.getState().loadSettings();
        const prefs = useTerminalSplitPrefsStore.getState();
        const match = resolveDefaultSplitAgent(
          {
            enabled: prefs.enabled,
            agentId: prefs.agentId,
            runConfig: prefs.runConfig,
          },
          quickOpenAgents,
        );
        if (match) {
          splitAndRunAgent(id, direction, match.command, match.agent);
          return;
        }
        splitTerminal(id, direction);
      })();
    },
    [quickOpenAgents, splitAndRunAgent, splitTerminal],
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

  const toggleFocusedAgentInput = useCallback(() => {
    const paneId = getFocusedPaneId();
    if (!paneId) return;
    setActivePaneIdWithAttention(paneId);
    agentInputOverlayRefsMap.current.get(paneId)?.toggle();
  }, [getFocusedPaneId, setActivePaneIdWithAttention]);

  const togglePinFocusedAgentInput = useCallback(() => {
    const paneId = getFocusedPaneId();
    if (!paneId) return;
    setActivePaneIdWithAttention(paneId);
    agentInputOverlayRefsMap.current.get(paneId)?.togglePin();
  }, [getFocusedPaneId, setActivePaneIdWithAttention]);

  useTerminalGridHotkeys({
    terminalHotkeyScopeRef,
    focusPaneByOffset,
    getFocusedPaneId,
    onNewTerminalTab,
    onToggleMaximize,
    pinPaneToCanvas,
    requestCloseTerminal,
    splitFocusedTerminal,
    toggleFocusedAgentInput,
    togglePinFocusedAgentInput,
  });

  const handleSplitMenuEnter = useCallback((key: string) => {
    if (splitMenuTimeoutRef.current) {
      clearTimeout(splitMenuTimeoutRef.current);
    }
    setSplitMenuKey(key);
  }, []);

  const handleSplitMenuLeave = useCallback(() => {
    // Grace period to reach the portaled dropdown from the split trigger.
    // Keep in mind with toolbar hover leave delay (useToolbarHoverExpand).
    splitMenuTimeoutRef.current = setTimeout(() => {
      setSplitMenuKey(null);
    }, 280);
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
      splitAndRunAgent(focusedPaneId, direction, command, agent);
    },
    [getFocusedPaneId, splitAndRunAgent],
  );

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    // Only show context menu when right-clicking inside the terminal grid container
    // but not on toolbar buttons or other interactive elements
    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest(".terminal-pane-toolbar")) return;
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

  // Custom naming (Rename Title / Keep Agent Name / Keep CWD) applies only to the
  // main workspace terminal grid — not the Project Wiki / Code Review scopes.
  const isDefaultScope = !isCodeReview && !isProjectWiki;
  const canRenameFocusedPane = isDefaultScope && !!focusedPane;

  const handleRenamePaneTitle = useCallback(
    (value: string) => {
      const focusedPaneId = getFocusedPaneId();
      if (!focusedPaneId || !isDefaultScope) return;
      setPaneCustomLabel(workspaceId, focusedPaneId, value, terminalTabId ?? FIXED_TERMINAL_TAB_VALUE);
    },
    [getFocusedPaneId, isDefaultScope, setPaneCustomLabel, workspaceId, terminalTabId],
  );

  const handleToggleKeepAgentName = useCallback(
    (next: boolean) => {
      const focusedPaneId = getFocusedPaneId();
      if (!focusedPaneId || !isDefaultScope) return;
      setPaneTitleFlags(
        workspaceId,
        focusedPaneId,
        { keepAgentName: next },
        terminalTabId ?? FIXED_TERMINAL_TAB_VALUE,
      );
    },
    [getFocusedPaneId, isDefaultScope, setPaneTitleFlags, workspaceId, terminalTabId],
  );

  const handleToggleKeepCwd = useCallback(
    (next: boolean) => {
      const focusedPaneId = getFocusedPaneId();
      if (!focusedPaneId || !isDefaultScope) return;
      setPaneTitleFlags(
        workspaceId,
        focusedPaneId,
        { keepCwd: next },
        terminalTabId ?? FIXED_TERMINAL_TAB_VALUE,
      );
    },
    [getFocusedPaneId, isDefaultScope, setPaneTitleFlags, workspaceId, terminalTabId],
  );

  const renderPane = useCallback((id: string) => {
    const pane = panes[id];
    if (!pane) return <div className="p-4 text-xs text-muted-foreground">Pane not found: {id}</div>;

    if (!isCodeReview && !isProjectWiki) {
      return (
        <TerminalWorkspacePane
          key={id}
          id={id}
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
          splitAndRunAgent={splitAndRunAgent}
          handleSplitMenuEnter={handleSplitMenuEnter}
          handleSplitMenuLeave={handleSplitMenuLeave}
          pinPaneToCanvas={pinPaneToCanvas}
          onToggleMaximize={onToggleMaximize}
          requestCloseTerminal={requestCloseTerminal}
          setActivePaneId={setActivePaneIdWithAttention}
          terminalRefsMap={terminalRefsMap}
          agentInputOverlayRefsMap={agentInputOverlayRefsMap}
          readyPanesRef={readyPanesRef}
          pendingRunsRef={pendingRunsRef}
          deliverPendingRunForPane={deliverPendingRunForPane}
          markPaneAttached={markPaneAttached}
          spawnTerminalWithRun={spawnTerminalWithRun}
          surfaceActive={isSurfaceActive}
        />
      );
    }

    return (
      <TerminalScopedPane
        key={id}
        id={id}
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
        splitAndRunAgent={splitAndRunAgent}
        handleSplitMenuEnter={handleSplitMenuEnter}
        handleSplitMenuLeave={handleSplitMenuLeave}
        pinPaneToCanvas={pinPaneToCanvas}
        onToggleMaximize={onToggleMaximize}
        requestCloseTerminal={requestCloseTerminal}
        setActivePaneId={setActivePaneIdWithAttention}
        terminalRefsMap={terminalRefsMap}
        agentInputOverlayRefsMap={agentInputOverlayRefsMap}
        readyPanesRef={readyPanesRef}
        pendingRunsRef={pendingRunsRef}
        deliverPendingRunForPane={deliverPendingRunForPane}
        setDynamicTitle={setDynamicTitleForScope}
        setOscTitle={setOscTitleForScope}
        setPaneAgent={setPaneAgentForScope}
        markPaneAttached={isCodeReview ? markCodeReviewPaneAttached : markProjectWikiPaneAttached}
        surfaceActive={isSurfaceActive}
      />
    );
  }, [
    isSurfaceActive,
    panes,
    performSplit,
    splitAndRunAgent,
    requestCloseTerminal,
    workspaceInfo,
    maximizedId,
    workspaceId,
    onToggleMaximize,
    setDynamicTitleForScope,
    setOscTitleForScope,
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
    deliverPendingRunForPane,
    pendingRunsRef,
    spawnTerminalWithRun,
  ]);

  // Prefer keeping existing panes mounted (APP-043 warm switch). If we already have
  // panes/layout, do NOT swap to LoadingState when ready flags briefly flap — that
  // remounts every Terminal and flashes "Connecting to terminal...".
  if (hasPanes && layout) {
    // fall through to split-view render below
  } else if (isProjectsLoading || !workspaceExists || !workspaceReady) {
    return <TerminalGridLoadingState className={className} />;
  } else {
    return (
      <TerminalGridEmptyState
        className={className}
        isProjectWiki={isProjectWiki}
        onAddTerminal={addTerminal}
      />
    );
  }

  const closeConfirmPane = closeConfirmPaneId ? panes[closeConfirmPaneId] : null;
  const closeConfirmTitle = closeConfirmPane
    ? getTerminalCloseConfirmName(closeConfirmPane, configuredAgents, contestedOwners)
    : "Terminal";

  return (
    <>
      <div
        ref={terminalHotkeyScopeRef}
        tabIndex={-1}
        className={cn("terminal-grid-container", className)}
        data-maximized-id={maximizedId || undefined}
        data-pane-dragging={isPaneDragging ? "true" : undefined}
        onContextMenu={handleContextMenu}
        onFocusCapture={(event) => rememberGridFocus(event.target)}
      >
        <TerminalSplitView
          className="terminal-split-theme"
          layout={layout}
          maximizedId={maximizedId}
          renderPane={renderPane}
          onLayoutChange={onChange}
          onResizeDragChange={setIsPaneDragging}
          capturePane={(paneId, width, height) =>
            terminalRefsMap.current.get(paneId)?.capturePreview(width, height) ??
            null
          }
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
      canRenamePane={canRenameFocusedPane}
      paneCustomLabel={focusedPane?.customLabel ?? ""}
      paneKeepAgentName={focusedPane?.keepAgentName ?? true}
      paneKeepCwd={focusedPane?.keepCwd ?? true}
      onRenamePaneTitle={handleRenamePaneTitle}
      onToggleKeepAgentName={handleToggleKeepAgentName}
      onToggleKeepCwd={handleToggleKeepCwd}
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
