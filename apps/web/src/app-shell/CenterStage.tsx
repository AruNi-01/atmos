"use client";

import React from "react";
import {
  Tabs,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  sortableKeyboardCoordinates,
  toastManager,
} from "@workspace/ui";
import {
  useEditorStore,
  useEditorStoreHydration,
  OpenFile,
} from "@/features/editor/store/use-editor-store";
import { useShallow } from "zustand/react/shallow";
import { useGitStore } from "@/features/git/store/use-git-store";
import type { ReviewTarget } from "@/api/ws-api";
import type { TerminalGridHandle } from "@/features/terminal/components/TerminalGrid";
import { useQueryStates } from "nuqs";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";
import { useReviewTerminalRunnerStore } from "@/features/code-review/hooks/use-review-terminal-runner";
import type { FixedTab } from "@/shared/lib/nuqs/searchParams";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import { useProjectStore } from "@/features/project/store/use-project-store";
import {
  readCenterStageLastTab,
  setCenterStageLastTab,
} from "@/shared/stores/use-ui-pref-hooks";
import { WorkspaceSetupProgressView } from "@/features/workspace/components/WorkspaceSetupProgress";
import { isWorkspaceSetupBlocking } from "@/features/workspace/lib/workspace-setup";
import { useGitInfoStore } from "@/features/git/store/use-git-info-store";
import { systemApi } from "@/api/rest-api";
import {
  PROJECT_WIKI_WINDOW_NAME,
  CODE_REVIEW_WINDOW_NAME,
  FIXED_TERMINAL_TAB_VALUE,
  findWorkspacePaneIdsByTmuxWindowName,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import { CodeReviewDialog } from "@/features/code-review";
import { useReviewSnapshotStore } from "@/features/code-review/hooks/use-review-snapshot-store";
import { usePrewarmCodeLanguages } from "@/shared/hooks/use-prewarm-code-languages";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useWorkspaceCreationStore } from "@/features/workspace/hooks/use-workspace-creation-store";
import { useExperimentSettings } from "@/features/settings/hooks/use-experiment-settings";
import {
  FIXED_TABS,
  isTerminalCenterTabValue,
  shellQuote,
  type TabGroupItem,
} from "@/app-shell/center-stage-tabs";
import { CenterStageTabBar } from "@/app-shell/CenterStageTabBar";
import {
  CenterStageFileTabContextMenu,
  type FileTabContextMenuState,
} from "@/app-shell/center-stage-file-menu";
import {
  TerminalCloseConfirmDialog,
  UnsavedChangesDialog,
} from "@/app-shell/center-stage-dialogs";
import { CenterStagePanels } from "@/app-shell/CenterStagePanels";
import {
  CenterStageNoContextView,
  resolveCenterStageProjectContext,
  useCenterStageKeyboardShortcuts,
  useCenterStageTabScrollEffects,
  usePendingNamedTerminalCommand,
  useReloadOpenFilesWhenReady,
  useTerminalTabMountLifecycle,
} from "@/app-shell/center-stage-support";
import { useCenterStageTabGroups } from "@/app-shell/use-center-stage-tab-groups";
import { useCenterStageTerminalAgents } from "@/app-shell/use-center-stage-terminal-agents";
import { useCenterStageNamedTerminalVisibility } from "@/app-shell/use-center-stage-named-terminal-visibility";

const CenterStage: React.FC = () => {
  usePrewarmCodeLanguages();
  const router = useAppRouter();

  const [fileToClose, setFileToClose] = React.useState<OpenFile | null>(null);
  const terminalGridRef = React.useRef<TerminalGridHandle>(null);
  const terminalGridRefs = React.useRef<Record<string, TerminalGridHandle | null>>({});
  const [mountedTerminalTabsByContext, setMountedTerminalTabsByContext] = React.useState<Record<string, string[]>>({});
  const scrollableTabsRef = React.useRef<HTMLDivElement>(null);
  const projectWikiTerminalGridRef = React.useRef<TerminalGridHandle>(null);
  const [projectWikiPendingCommand, setProjectWikiPendingCommand] = React.useState<string | null>(null);
  const [projectWikiCloseConfirmOpen, setProjectWikiCloseConfirmOpen] = React.useState(false);
  const [wikiRefreshTrigger, setWikiRefreshTrigger] = React.useState(0);
  const [wikiRefreshing, setWikiRefreshing] = React.useState(false);
  const [tabContextMenu, setTabContextMenu] = React.useState<FileTabContextMenuState>(null);
  const [tabGroupPopoverOpen, setTabGroupPopoverOpen] = React.useState(false);
  const tabGroupDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [termTabPlusHoveredTabId, setTermTabPlusHoveredTabId] = React.useState<string | null>(null);

  // Code Review tab state
  const codeReviewTerminalGridRef = React.useRef<TerminalGridHandle>(null);
  const [codeReviewPendingCommand, setCodeReviewPendingCommand] = React.useState<string | null>(null);
  const [codeReviewCloseConfirmOpen, setCodeReviewCloseConfirmOpen] = React.useState(false);
  // codeReviewDialogOpen is managed via useDialogStore for cross-component access
  const pendingWorkspaceAgentRun = useWorkspaceCreationStore((s) => s.pendingAgentRun);
  const consumeWorkspaceAgentRun = useWorkspaceCreationStore((s) => s.consumeAgentRun);

  // Wait for editor store hydration to avoid SSR mismatch
  useEditorStoreHydration();

  const { workspaceId, projectId: projectIdFromUrl, effectiveContextId, currentView } = useContextParams();
  const {
    terminalTabs,
    createTerminalTab,
    closeTerminalTab,
    setActiveTerminalTab,
    primeWorkspace,
    evictWorkspaceRuntime,
  } = useTerminalStore(
    useShallow((state) => ({
      terminalTabs: effectiveContextId
        ? state.workspaceTerminalTabs[effectiveContextId]
        : undefined,
      createTerminalTab: state.createTerminalTab,
      closeTerminalTab: state.closeTerminalTab,
      setActiveTerminalTab: state.setActiveTerminalTab,
      primeWorkspace: state.primeWorkspace,
      evictWorkspaceRuntime: state.evictWorkspaceRuntime,
    }))
  );
  const isTerminalWorkspaceReady = useTerminalStore((state) => {
    if (!effectiveContextId) return false;
    return (
      state.loadedWorkspaces.has(effectiveContextId) &&
      state.hydratedTerminalScopes.has(effectiveContextId)
    );
  });
  const setupProgressMap = useProjectStore((s) => s.setupProgress);
  const currentSetupProgress = workspaceId ? setupProgressMap[workspaceId] : null;
  const isSetupBlocking = isWorkspaceSetupBlocking(currentSetupProgress);
  const visibleTerminalTabs = React.useMemo(
    () => terminalTabs && terminalTabs.length > 0
      ? terminalTabs
      : [{ id: FIXED_TERMINAL_TAB_VALUE, title: "Term", closable: false }],
    [terminalTabs]
  );
  const mountedTerminalTabs = React.useMemo(
    () => (effectiveContextId ? mountedTerminalTabsByContext[effectiveContextId] ?? [] : []),
    [effectiveContextId, mountedTerminalTabsByContext]
  );

  const centerWikiTabEnabled = useExperimentSettings((s) => s.centerWikiTabEnabled);
  const experimentPrefsLoaded = useExperimentSettings((s) => s.loaded);
  const loadExperimentSettings = useExperimentSettings((s) => s.loadSettings);
  React.useEffect(() => {
    void loadExperimentSettings();
  }, [loadExperimentSettings]);

  // --- URL-synced tab state ---
  const [{ tab: tabFromUrl, wikiPage: wikiPageFromUrl, terminalTmux }, setUrlParams] = useQueryStates(centerStageParams);

  const redirectMissingNamedTerminalTab = React.useCallback(() => {
    setUrlParams({ tab: "terminal" });
  }, [setUrlParams]);

  const {
    codeReviewTabVisible,
    codeReviewUserTriggeredRef,
    projectWikiTabVisible,
    projectWikiUserTriggeredRef,
    setCodeReviewVisibleMap,
    setProjectWikiVisibleMap,
  } = useCenterStageNamedTerminalVisibility({
    currentTab: tabFromUrl,
    effectiveContextId,
    isSetupBlocking,
    onMissingCodeReviewTab: redirectMissingNamedTerminalTab,
    onMissingProjectWikiTab: redirectMissingNamedTerminalTab,
  });

  /** Until experiment prefs load, preserve `tab=wiki` from the URL so we do not strip deep links. */
  const wikiCenterEligible = React.useMemo(() => {
    if (experimentPrefsLoaded) return centerWikiTabEnabled;
    return tabFromUrl === "wiki";
  }, [experimentPrefsLoaded, centerWikiTabEnabled, tabFromUrl]);

  const resolvedTab = React.useMemo(() => {
    if (tabFromUrl === "wiki" && experimentPrefsLoaded && !centerWikiTabEnabled) {
      return FIXED_TERMINAL_TAB_VALUE;
    }
    if (tabFromUrl === "project-wiki" && !projectWikiTabVisible) return "terminal";
    if (tabFromUrl === "code-review" && !codeReviewTabVisible) return "terminal";
    if (isTerminalCenterTabValue(tabFromUrl)) {
      return visibleTerminalTabs.some((tab) => tab.id === tabFromUrl)
        ? tabFromUrl
        : FIXED_TERMINAL_TAB_VALUE;
    }
    return tabFromUrl;
  }, [
    tabFromUrl,
    experimentPrefsLoaded,
    centerWikiTabEnabled,
    projectWikiTabVisible,
    codeReviewTabVisible,
    visibleTerminalTabs,
  ]);

  React.useEffect(() => {
    if (!experimentPrefsLoaded || centerWikiTabEnabled || tabFromUrl !== "wiki") return;
    setUrlParams({ tab: FIXED_TERMINAL_TAB_VALUE, wikiPage: null });
  }, [experimentPrefsLoaded, centerWikiTabEnabled, tabFromUrl, setUrlParams]);

  const setFixedTab = React.useCallback(
    (tab: FixedTab) => {
      if (tab === "wiki" && experimentPrefsLoaded && !centerWikiTabEnabled) return;
      if (tab === resolvedTab) return;
      const updates: Parameters<typeof setUrlParams>[0] = { tab };
      // Clear wikiPage when leaving wiki tab
      if (tab !== "wiki") {
        updates.wikiPage = null;
      }
      setUrlParams(updates);
    },
    [resolvedTab, setUrlParams, experimentPrefsLoaded, centerWikiTabEnabled]
  );

  const setWikiPage = React.useCallback(
    (page: string) => {
      if (experimentPrefsLoaded && !centerWikiTabEnabled) return;
      setUrlParams({ tab: "wiki" as const, wikiPage: page });
    },
    [setUrlParams, experimentPrefsLoaded, centerWikiTabEnabled]
  );

  const {
    setWorkspaceId,
    getOpenFiles,
    getActiveFilePath,
    setActiveFile,
    closeFile,
    pinFile,
    reloadFileContent,
  } = useEditorStore(
    useShallow(s => ({
      setWorkspaceId: s.setWorkspaceId,
      getOpenFiles: s.getOpenFiles,
      getActiveFilePath: s.getActiveFilePath,
      setActiveFile: s.setActiveFile,
      closeFile: s.closeFile,
      pinFile: s.pinFile,
      reloadFileContent: s.reloadFileContent,
    }))
  );
  const setCreateProjectOpen = useDialogStore(s => s.setCreateProjectOpen);
  const isCodeReviewDialogOpen = useDialogStore(s => s.isCodeReviewDialogOpen);
  const setCodeReviewDialogOpen = useDialogStore(s => s.setCodeReviewDialogOpen);
  const projects = useProjectStore(s => s.projects);
  const clearSetupProgress = useProjectStore(s => s.clearSetupProgress);
  const { currentBranch } = useGitInfoStore();

  const handleCloseFile = React.useCallback((file: OpenFile) => {
    if (file.isDirty) {
      setFileToClose(file);
    } else {
      closeFile(file.path);
    }
  }, [closeFile]);

  const confirmClose = React.useCallback(() => {
    if (fileToClose) {
      closeFile(fileToClose.path);
      setFileToClose(null);
    }
  }, [closeFile, fileToClose]);

  const reviewTarget = React.useMemo((): ReviewTarget | null => {
    if (workspaceId) return { kind: "workspace", workspaceId };
    if (projectIdFromUrl) return { kind: "project", projectId: projectIdFromUrl };
    return null;
  }, [workspaceId, projectIdFromUrl]);

  const closeFilesSafely = (files: OpenFile[]) => {
    if (files.length === 0) return;
    const closable = files.filter((f) => !f.isDirty);

    for (const file of closable) {
      closeFile(file.path, effectiveContextId || undefined);
    }
  };

  const handleFinishSetup = () => {
    if (workspaceId) {
      clearSetupProgress(workspaceId);
    }
  };

  // Sync effective context ID with store
  React.useEffect(() => {
    setWorkspaceId(effectiveContextId);
  }, [effectiveContextId, setWorkspaceId]);

  const openFiles = getOpenFiles(effectiveContextId || undefined);
  const activeFilePath = getActiveFilePath(effectiveContextId || undefined);

  // activeValue 优先使用打开的文件路径，否则使用当前 center tab
  const activeValue = activeFilePath || resolvedTab;

  useTerminalTabMountLifecycle({
    activeValue,
    codeReviewTerminalGridRef,
    effectiveContextId,
    evictWorkspaceRuntime,
    projectWikiTerminalGridRef,
    setMountedTerminalTabsByContext,
    terminalGridRef,
    terminalGridRefsRef: terminalGridRefs,
    visibleTerminalTabs,
  });

  useReloadOpenFilesWhenReady({
    effectiveContextId,
    isSetupBlocking,
    openFiles,
    reloadFileContent,
  });

  useCenterStageTabScrollEffects({
    activeValue,
    codeReviewTabVisible,
    effectiveContextId,
    openFilesCount: openFiles.length,
    projectWikiTabVisible,
    scrollableTabsRef,
    visibleTerminalTabsCount: visibleTerminalTabs.length,
  });

  usePendingNamedTerminalCommand({
    activeTabValue: "project-wiki",
    activeValue,
    effectiveContextId,
    pendingCommand: projectWikiPendingCommand,
    setPendingCommand: setProjectWikiPendingCommand,
    tabVisible: projectWikiTabVisible,
    terminalGridRef: projectWikiTerminalGridRef,
    terminalLabel: PROJECT_WIKI_WINDOW_NAME,
    userTriggeredRef: projectWikiUserTriggeredRef,
  });

  usePendingNamedTerminalCommand({
    activeTabValue: "code-review",
    activeValue,
    effectiveContextId,
    pendingCommand: codeReviewPendingCommand,
    setPendingCommand: setCodeReviewPendingCommand,
    tabVisible: codeReviewTabVisible,
    terminalGridRef: codeReviewTerminalGridRef,
    terminalLabel: CODE_REVIEW_WINDOW_NAME,
    userTriggeredRef: codeReviewUserTriggeredRef,
  });

  React.useEffect(() => {
    if (!effectiveContextId) return;
    primeWorkspace(effectiveContextId, currentView === "project");
  }, [currentView, effectiveContextId, primeWorkspace]);

  React.useEffect(() => {
    if (!effectiveContextId || !isTerminalCenterTabValue(activeValue)) return;
    setActiveTerminalTab(effectiveContextId, activeValue);
  }, [effectiveContextId, activeValue, setActiveTerminalTab]);

  React.useEffect(() => {
    if (!effectiveContextId || !activeValue) return;
    setCenterStageLastTab(effectiveContextId, activeValue);
  }, [effectiveContextId, activeValue]);

  React.useEffect(() => {
    if (!effectiveContextId || activeFilePath) return;
    const last = readCenterStageLastTab(effectiveContextId);
    if (!last || last === activeValue) return;
    if (FIXED_TABS.has(last)) {
      setFixedTab(last as FixedTab);
      return;
    }
    if (isTerminalCenterTabValue(last) && visibleTerminalTabs.some((tab) => tab.id === last)) {
      setUrlParams({ tab: last, wikiPage: null });
      return;
    }
    const exists = openFiles.some((f) => f.path === last);
    if (exists) {
      setActiveFile(last, effectiveContextId);
    }
  }, [effectiveContextId, activeFilePath, activeValue, openFiles, setActiveFile, setFixedTab, setUrlParams, visibleTerminalTabs]);

  const { defaultAgentId, terminalQuickOpenAgents } = useCenterStageTerminalAgents(isSetupBlocking);

  const runWhenTerminalGridReady = React.useCallback((
    targetTerminalTabId: string,
    callback: (grid: TerminalGridHandle) => void,
    attemptsLeft = 20,
  ) => {
    const attempt = (remaining: number) => {
      const targetGrid =
        targetTerminalTabId === FIXED_TERMINAL_TAB_VALUE
          ? terminalGridRef.current
          : terminalGridRefs.current[targetTerminalTabId];

      if (targetGrid) {
        callback(targetGrid);
        return;
      }

      if (remaining <= 0) {
        return;
      }

      window.setTimeout(() => {
        attempt(remaining - 1);
      }, 50);
    };

    attempt(attemptsLeft);
  }, []);

  // Try to focus pane by tmux window name across all terminal tabs
  const focusPaneByTmuxAcrossAllTabs = React.useCallback((tmuxWindowName: string) => {
    // Try fixed terminal grid first
    if (terminalGridRef.current?.focusPaneByTmuxWindowName(tmuxWindowName)) {
      return true;
    }
    // Try all other terminal tabs
    for (const tab of visibleTerminalTabs) {
      if (tab.id === FIXED_TERMINAL_TAB_VALUE) continue;
      const grid = terminalGridRefs.current[tab.id];
      if (grid?.focusPaneByTmuxWindowName(tmuxWindowName)) {
        return true;
      }
    }
    return false;
  }, [visibleTerminalTabs]);

  React.useEffect(() => {
    const tmux = terminalTmux?.trim();
    if (!effectiveContextId || !tmux) return;
    if (isSetupBlocking) return;
    if (currentView !== "workspace" && currentView !== "project") return;
    if (!isTerminalWorkspaceReady) return;

    if (activeFilePath) {
      setActiveFile(null, effectiveContextId);
    }

    // Resolve which terminal tab actually owns the pane. Deep links (e.g. from
    // the footer agent status) may arrive without a `tab` param, or with a
    // stale one — without this switch we'd stay on whatever tab is active
    // (usually the Fixed term on a fresh workspace load) and silently focus
    // the pane inside a hidden grid.
    const owningTab = findWorkspacePaneIdsByTmuxWindowName(
      useTerminalStore.getState(),
      effectiveContextId,
      tmux,
    )?.terminalTabId;

    if (owningTab && owningTab !== resolvedTab) {
      setUrlParams({ tab: owningTab });
      // Wait for the next effect run (URL flip → tab mount) before focusing.
      return;
    }

    const tabForGrid = owningTab
      ?? (isTerminalCenterTabValue(resolvedTab) ? resolvedTab : FIXED_TERMINAL_TAB_VALUE);

    let cancelled = false;
    runWhenTerminalGridReady(
      tabForGrid,
      () => {
        if (cancelled) return;
        // Try to focus pane across all tabs (not just the current tab)
        if (!focusPaneByTmuxAcrossAllTabs(tmux)) return;
        setUrlParams({ terminalTmux: null });
      },
      40,
    );

    return () => {
      cancelled = true;
    };
  }, [
    activeFilePath,
    currentView,
    effectiveContextId,
    focusPaneByTmuxAcrossAllTabs,
    isSetupBlocking,
    isTerminalWorkspaceReady,
    resolvedTab,
    runWhenTerminalGridReady,
    setActiveFile,
    setUrlParams,
    terminalTmux,
  ]);

  React.useEffect(() => {
    if (
      !effectiveContextId ||
      currentView !== "workspace" ||
      isSetupBlocking ||
      !isTerminalWorkspaceReady ||
      pendingWorkspaceAgentRun?.workspaceId !== effectiveContextId
    ) {
      return;
    }

    const pending = consumeWorkspaceAgentRun(effectiveContextId);
    if (!pending) return;
    const selectedAgent =
      pending.agent
        ? { agent: pending.agent, command: pending.agent.command }
        : terminalQuickOpenAgents.find(({ agent }) => agent.id === defaultAgentId) ??
          terminalQuickOpenAgents[0];
    if (!selectedAgent) return;

    const prompt = pending.prompt.trim();
    const command = prompt
      ? `${selectedAgent.command.trim()} ${shellQuote(prompt)}`
      : selectedAgent.command.trim();

    setActiveFile(null, effectiveContextId);
    setActiveTerminalTab(effectiveContextId, FIXED_TERMINAL_TAB_VALUE);
    setUrlParams({ tab: FIXED_TERMINAL_TAB_VALUE, wikiPage: null });
    runWhenTerminalGridReady(FIXED_TERMINAL_TAB_VALUE, (grid) => {
      void grid.createAndRunTerminal({
        label: selectedAgent.agent.label,
        command,
        agent: selectedAgent.agent,
      });
    }, 40);
  }, [
    consumeWorkspaceAgentRun,
    currentView,
    defaultAgentId,
    effectiveContextId,
    isSetupBlocking,
    isTerminalWorkspaceReady,
    pendingWorkspaceAgentRun,
    setActiveFile,
    setActiveTerminalTab,
    setUrlParams,
    runWhenTerminalGridReady,
    terminalQuickOpenAgents,
  ]);

  const handleRunReviewInTerminal = React.useCallback(
    (command: string, label: string) => {
      if (!effectiveContextId) return;
      if (activeFilePath) {
        setActiveFile(null, effectiveContextId);
      }
      setActiveTerminalTab(effectiveContextId, FIXED_TERMINAL_TAB_VALUE);
      setUrlParams({ tab: FIXED_TERMINAL_TAB_VALUE, wikiPage: null });
      runWhenTerminalGridReady(FIXED_TERMINAL_TAB_VALUE, (grid) => {
        void grid.createAndRunTerminal({ label, command });
      });
    },
    [activeFilePath, effectiveContextId, runWhenTerminalGridReady, setActiveFile, setActiveTerminalTab, setUrlParams],
  );

  React.useEffect(() => {
    useReviewTerminalRunnerStore.getState().setRunner(handleRunReviewInTerminal);
    return () => {
      useReviewTerminalRunnerStore.getState().setRunner(null);
    };
  }, [handleRunReviewInTerminal]);

  const handleCreateTerminalCenterTab = React.useCallback(() => {
    if (!effectiveContextId) return;
    const nextTab = createTerminalTab(effectiveContextId);
    setActiveTerminalTab(effectiveContextId, nextTab.id);
    setUrlParams({ tab: nextTab.id, wikiPage: null });
    setActiveFile(null, effectiveContextId);
    runWhenTerminalGridReady(nextTab.id, (grid) => grid.focusActivePane());
  }, [effectiveContextId, createTerminalTab, runWhenTerminalGridReady, setActiveFile, setActiveTerminalTab, setUrlParams]);

  const handleCloseTerminalCenterTab = React.useCallback((tabId: string) => {
    if (!effectiveContextId || tabId === FIXED_TERMINAL_TAB_VALUE) return;
    terminalGridRefs.current[tabId]?.destroyAllTerminals();
    closeTerminalTab(effectiveContextId, tabId);
    delete terminalGridRefs.current[tabId];
    setMountedTerminalTabsByContext((current) => {
      const mountedTabs = current[effectiveContextId];
      if (!mountedTabs || !mountedTabs.includes(tabId)) {
        return current;
      }

      return {
        ...current,
        [effectiveContextId]: mountedTabs.filter((mountedTabId) => mountedTabId !== tabId),
      };
    });
    if (activeValue === tabId) {
      setUrlParams({ tab: FIXED_TERMINAL_TAB_VALUE, wikiPage: null });
    }
  }, [activeValue, closeTerminalTab, effectiveContextId, setUrlParams]);

  const handleCenterStageTabChange = React.useCallback((val: string) => {
    if (val === "wiki" && experimentPrefsLoaded && !centerWikiTabEnabled) {
      setUrlParams({ tab: FIXED_TERMINAL_TAB_VALUE, wikiPage: null });
      setActiveFile(null, effectiveContextId || undefined);
      return;
    }
    if (isTerminalCenterTabValue(val)) {
      if (effectiveContextId) {
        setActiveTerminalTab(effectiveContextId, val);
      }
      setUrlParams({ tab: val, wikiPage: null });
      setActiveFile(null, effectiveContextId || undefined);
      // Focus the active pane after switching to a terminal tab
      if (val === FIXED_TERMINAL_TAB_VALUE) {
        terminalGridRef.current?.focusActivePane();
      } else {
        runWhenTerminalGridReady(val, (grid) => grid.focusActivePane());
      }
    } else if (FIXED_TABS.has(val)) {
      setFixedTab(val as FixedTab);
      setActiveFile(null, effectiveContextId || undefined);
    } else {
      setActiveFile(val, effectiveContextId || undefined);
      // Clear tab param when opening a file
      setUrlParams({ tab: null, wikiPage: null });
    }
  }, [
    centerWikiTabEnabled,
    experimentPrefsLoaded,
    effectiveContextId,
    setActiveFile,
    setActiveTerminalTab,
    setFixedTab,
    setUrlParams,
    runWhenTerminalGridReady,
  ]);

  useCenterStageKeyboardShortcuts({
    effectiveContextId,
    handleCenterStageTabChange,
    visibleTerminalTabs,
  });

  const {
    handleTabGroupDragEnd,
    orderedGroupedTabItems,
  } = useCenterStageTabGroups({
    effectiveContextId,
    openFiles,
  });

  const { currentRepoPath } = useGitStore();
  const sessionDisplay = useReviewSnapshotStore((s) => s.sessionDisplay);

  const handleCloseTabGroupItem = React.useCallback((tab: TabGroupItem) => {
    if (tab.kind === "terminal" && tab.value !== FIXED_TERMINAL_TAB_VALUE) {
      handleCloseTerminalCenterTab(tab.value);
      return;
    }

    if (tab.kind === "project-wiki") {
      setProjectWikiCloseConfirmOpen(true);
      return;
    }

    if (tab.kind === "code-review") {
      setCodeReviewCloseConfirmOpen(true);
      return;
    }

    if (tab.file) {
      handleCloseFile(tab.file);
    }
  }, [handleCloseFile, handleCloseTerminalCenterTab]);

  const { currentProject, currentWorkspace } = resolveCenterStageProjectContext(
    projects,
    effectiveContextId,
  );

  const handleConfirmCloseProjectWikiTerminal = async () => {
    if (effectiveContextId) {
      try {
        await systemApi.killProjectWikiWindow(effectiveContextId);
        projectWikiTerminalGridRef.current?.removeTerminalByTmuxWindowName(PROJECT_WIKI_WINDOW_NAME);
        setProjectWikiVisibleMap(prev => ({ ...prev, [effectiveContextId]: false }));
        setFixedTab("terminal");
      } catch (err) {
        toastManager.add({
          title: "Failed to close terminal",
          description: err instanceof Error ? err.message : "Unknown error",
          type: "error",
        });
      }
    }
    setProjectWikiCloseConfirmOpen(false);
  };

  const handleConfirmCloseCodeReviewTerminal = async () => {
    if (effectiveContextId) {
      try {
        await systemApi.killCodeReviewWindow(effectiveContextId);
        codeReviewTerminalGridRef.current?.removeTerminalByTmuxWindowName(CODE_REVIEW_WINDOW_NAME);
        setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: false }));
        setFixedTab("terminal");
      } catch (err) {
        toastManager.add({
          title: "Failed to close terminal",
          description: err instanceof Error ? err.message : "Unknown error",
          type: "error",
        });
      }
    }
    setCodeReviewCloseConfirmOpen(false);
  };

  if (!effectiveContextId) {
    return (
      <CenterStageNoContextView
        currentView={currentView}
        onAddProject={() => setCreateProjectOpen(true)}
        onConnectAgent={() => {
          router.push('/agents');
        }}
      />
    );
  }

  // Show setup progress if active workspace is being initialized
  if (currentSetupProgress && isSetupBlocking) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <WorkspaceSetupProgressView
          progress={currentSetupProgress}
          onFinish={handleFinishSetup}
        />
      </main>
    );
  }



  return (
    <main className="h-full flex flex-col overflow-hidden">
      <Tabs
        value={activeValue}
        onValueChange={handleCenterStageTabChange}
        className="flex-1 flex flex-col gap-0 min-h-0 overflow-hidden"
      >
        {/* Top Tab Bar */}
        <CenterStageTabBar
          activeValue={activeValue}
          codeReviewTabVisible={codeReviewTabVisible}
          effectiveContextId={effectiveContextId}
          openFiles={openFiles}
          orderedGroupedTabItems={orderedGroupedTabItems}
          projectWikiTabVisible={projectWikiTabVisible}
          scrollableTabsRef={scrollableTabsRef}
          sessionDisplay={sessionDisplay}
          tabGroupDndSensors={tabGroupDndSensors}
          tabGroupPopoverOpen={tabGroupPopoverOpen}
          termTabPlusHoveredTabId={termTabPlusHoveredTabId}
          visibleTerminalTabs={visibleTerminalTabs}
          wikiCenterEligible={wikiCenterEligible}
          wikiRefreshing={wikiRefreshing}
          handleCenterStageTabChange={handleCenterStageTabChange}
          handleCloseTabGroupItem={handleCloseTabGroupItem}
          handleCloseFile={handleCloseFile}
          handleCloseTerminalCenterTab={handleCloseTerminalCenterTab}
          handleCreateTerminalCenterTab={handleCreateTerminalCenterTab}
          handleTabGroupDragEnd={handleTabGroupDragEnd}
          pinFile={pinFile}
          setActiveFile={setActiveFile}
          setCodeReviewCloseConfirmOpen={setCodeReviewCloseConfirmOpen}
          setProjectWikiCloseConfirmOpen={setProjectWikiCloseConfirmOpen}
          setTabContextMenu={setTabContextMenu}
          setTabGroupPopoverOpen={setTabGroupPopoverOpen}
          setTermTabPlusHoveredTabId={setTermTabPlusHoveredTabId}
          setWikiRefreshing={setWikiRefreshing}
          setWikiRefreshTrigger={setWikiRefreshTrigger}
        />

        <CenterStagePanels
          activeValue={activeValue}
          codeReviewTabVisible={codeReviewTabVisible}
          codeReviewTerminalGridRef={codeReviewTerminalGridRef}
          currentBranch={currentBranch}
          currentProject={currentProject}
          currentRepoPath={currentRepoPath}
          currentView={currentView}
          currentWorkspace={currentWorkspace}
          effectiveContextId={effectiveContextId}
          handleCreateTerminalCenterTab={handleCreateTerminalCenterTab}
          mountedTerminalTabs={mountedTerminalTabs}
          openFiles={openFiles}
          projectWikiTabVisible={projectWikiTabVisible}
          projectWikiTerminalGridRef={projectWikiTerminalGridRef}
          projectWikiUserTriggeredRef={projectWikiUserTriggeredRef}
          reviewTarget={reviewTarget}
          setFixedTab={setFixedTab}
          setProjectWikiPendingCommand={setProjectWikiPendingCommand}
          setProjectWikiVisibleMap={setProjectWikiVisibleMap}
          setWikiPage={setWikiPage}
          terminalGridRef={terminalGridRef}
          terminalGridRefs={terminalGridRefs}
          terminalQuickOpenAgents={terminalQuickOpenAgents}
          visibleTerminalTabs={visibleTerminalTabs}
          wikiCenterEligible={wikiCenterEligible}
          wikiPageFromUrl={wikiPageFromUrl}
          wikiRefreshTrigger={wikiRefreshTrigger}
        />
      </Tabs>

      <CenterStageFileTabContextMenu
        tabContextMenu={tabContextMenu}
        setTabContextMenu={setTabContextMenu}
        openFiles={openFiles}
        basePath={currentWorkspace?.localPath || currentProject?.mainFilePath}
        onCloseFile={handleCloseFile}
        closeFilesSafely={closeFilesSafely}
      />

      <TerminalCloseConfirmDialog
        open={projectWikiCloseConfirmOpen}
        onOpenChange={setProjectWikiCloseConfirmOpen}
        title="Close Project Wiki terminal?"
        description="Any running wiki generation will be stopped. You can start a new generation from the Wiki tab."
        onConfirm={handleConfirmCloseProjectWikiTerminal}
      />

      <TerminalCloseConfirmDialog
        open={codeReviewCloseConfirmOpen}
        onOpenChange={setCodeReviewCloseConfirmOpen}
        title="Close Code Review terminal?"
        description="Any running code review will be stopped. You can start a new review from the Changes panel."
        onConfirm={handleConfirmCloseCodeReviewTerminal}
      />

      {/* Code Review Dialog */}
      {effectiveContextId && (
        <CodeReviewDialog
          open={isCodeReviewDialogOpen}
          onOpenChange={setCodeReviewDialogOpen}
          workspaceId={effectiveContextId}
          reviewTarget={reviewTarget ?? undefined}
          projectName={currentProject?.name}
          workspacePath={currentWorkspace?.localPath || currentProject?.mainFilePath || ""}
          projectMainPath={currentProject?.mainFilePath}
          currentBranch={currentBranch ?? undefined}
          onStartTerminalMode={(command) => {
            if (!effectiveContextId) return;
            codeReviewUserTriggeredRef.current = true;
            setCodeReviewPendingCommand(command);
            setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
            setFixedTab("code-review");
          }}
          onReplaceTerminalAndRun={async (command) => {
            if (!effectiveContextId) return;
            try {
              await systemApi.killCodeReviewWindow(effectiveContextId);
              codeReviewTerminalGridRef.current?.removeTerminalByTmuxWindowName(CODE_REVIEW_WINDOW_NAME);
              codeReviewUserTriggeredRef.current = true;
              setCodeReviewPendingCommand(command);
              setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
              setFixedTab("code-review");
              toastManager.add({
                title: "Code review started",
                description: "Switched to Code Review tab. Check progress there.",
                type: "info",
              });
            } catch (err) {
              setCodeReviewPendingCommand(null);
              toastManager.add({
                title: "Failed to close previous terminal",
                description: err instanceof Error ? err.message : "Unknown error",
                type: "error",
              });
            }
          }}
        />
      )}

      <UnsavedChangesDialog
        fileToClose={fileToClose}
        onCancel={() => setFileToClose(null)}
        onConfirm={confirmClose}
      />

    </main>
  );
};

export default CenterStage;
