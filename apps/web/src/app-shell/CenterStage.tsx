"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import { useQueryStates } from "nuqs";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";
import { useReviewTerminalRunnerStore } from "@/features/code-review/store/review-terminal-runner-store";
import { useAgentFixLauncherStore } from "@/features/agent-fix/store/agent-fix-launcher-store";
import type { ResolvedAgentFixLaunchRequest } from "@/features/agent-fix/types";
import type { FixedTab } from "@/shared/lib/nuqs/searchParams";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { registerBrowserHostChrome } from "@/features/browser/lib/ensure-browser-surface";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import { useProjectStore } from "@/features/project/store/use-project-store";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import {
  clearLastPinnedTerminal,
  readCenterStageLastTab,
  readCenterStageTabStripOrder,
  setCenterStageLastTab,
  writeCenterStageTabStripOrder,
} from "@/shared/stores/use-ui-pref-hooks";
import { WorkspaceSetupProgressView } from "@/features/workspace/components/WorkspaceSetupProgress";
import { isWorkspaceSetupBlocking } from "@/features/workspace/lib/workspace-setup";
import { planTerminalLastTabRestore } from "@/app-shell/workspace-surface-restore";
import {
  scheduleAfterPaint,
  scheduleIdle,
} from "@/app-shell/workspace-surface-switch";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import { invalidateGitQueries } from "@/features/git/hooks/use-git-changed-files-query";
import { systemApi } from "@/api/rest-api";
import {
  PROJECT_WIKI_WINDOW_NAME,
  CODE_REVIEW_WINDOW_NAME,
  FIXED_TERMINAL_TAB_VALUE,
  findWorkspacePaneIdsByTmuxWindowName,
  getTerminalWorkspaceScopeKey,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import {
  hasNonIdleTerminalPanes,
  isTerminalPaneNonIdle,
} from "@/features/terminal/lib/terminal-grid-utils";
import { resolveTerminalCenterTabPresentation } from "@/features/terminal/lib/terminal-center-tab-presentation";
import { getTerminalCloseConfirmName } from "@/features/terminal/lib/terminal-close-confirm-name";
import { getScopeKey } from "@/features/terminal/store/terminal-store-helpers";
import { CodeReviewDialog } from "@/features/code-review";
import { useReviewSnapshotStore } from "@/features/code-review/store/review-snapshot-store";
import { usePrewarmCodeLanguages } from "@/shared/hooks/use-prewarm-code-languages";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { buildInteractiveAgentRunPlan } from "@/features/agent/lib/terminal-agent-run-config";
import { resolveDefaultSplitAgent } from "@/features/terminal/lib/terminal-split-prefs";
import { useTerminalSplitPrefsStore } from "@/features/settings/store/terminal-split-prefs-store";
import { resolveAgentFixLaunchPrompt } from "@/features/agent-fix/lib/agent-fix-prompt-file";
import { useWorkspaceCreationStore } from "@/features/workspace/store/workspace-creation-store";
import { useAgentTitleSettingsStore } from "@/features/settings/store/agent-title-settings-store";
import { useExperimentSettingsStore } from "@/features/settings/store/experiment-settings-store";
import {
  FIXED_TABS,
  isTerminalCenterTabValue,
  type TabGroupItem,
} from "@/app-shell/center-stage-tabs";
import { shouldSkipLastTabRestoreForUrlTab } from "@/app-shell/center-stage-fixed-tabs";
import { CenterStageTabBar } from "@/app-shell/CenterStageTabBar";
import {
  CenterStageTabContextMenu,
} from "@/app-shell/center-stage-tab-menu";
import type {
  CenterTabContextMenuState,
  CenterTabDescriptor,
} from "@/app-shell/center-stage-tab-model";
import { isFileLikeCenterTabKind } from "@/app-shell/center-stage-tab-model";
import {
  buildOpenCenterTabValues,
  pickNextCenterTabFromActivationStack,
  recordCenterTabActivation,
  removeCenterTabFromActivationStack,
} from "@/app-shell/center-stage-tab-activation-stack";
import {
  TerminalCloseConfirmDialog,
  UnsavedChangesDialog,
} from "@/app-shell/center-stage-dialogs";

type PendingCenterTabClose =
  | { kind: "file"; file: OpenFile }
  | { kind: "terminal"; tabId: string; title: string; runningPaneNames: string[] }
  | { kind: "project-wiki" }
  | { kind: "code-review" };
import { CenterStagePanels } from "@/app-shell/CenterStagePanels";
import {
  CenterPaneContentSlot,
  CenterPaneGrid,
} from "@/app-shell/center-pane/CenterPaneGrid";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import {
  collectActiveTabIds,
  createDefaultLayout,
  isEmptyPane,
  isPrimaryPane,
  MAX_CENTER_PANES,
  OVERVIEW_TAB_ID,
} from "@/app-shell/center-pane/center-pane-layout";
import { useCenterPaneSlotBoxes } from "@/app-shell/center-pane/use-center-pane-slot-boxes";
import {
  collectSavedSurfaces,
  isToolSurfaceKind,
  materializeSavedLayout,
  resolveSurfaceTabId,
  snapshotCenterLayout,
  type CenterSurfaceKind,
} from "@/app-shell/center-pane/center-pane-saved-layout";
import { useCenterPaneSavedLayoutStore } from "@/app-shell/center-pane/center-pane-saved-layout-store";
import {
  buildDefaultEmptyPaneActions,
  CenterPaneEmptyState,
} from "@/app-shell/center-pane/CenterPaneEmptyState";
import {
  SIMULATOR_TAB_VALUE,
  useSimulatorCenterTabStore,
} from "@/features/simulator";
import { simulatorApi } from "@/api/ws/simulator-api";
import { GIT_HISTORY_TAB_VALUE } from "@/features/git/types";
import { useGitHistoryCenterTabStore } from "@/features/git/store/use-git-history-center-tab";
import {
  isCenterToolTabValue,
  useToolCenterTabsStore,
  type CenterToolTabValue,
} from "@/app-shell/center-tool-tabs";
import {
  CenterStageNoContextView,
  resolveCenterStageProjectContext,
  useCenterStageKeyboardShortcuts,
  useCenterStageTabScrollEffects,
  usePendingNamedTerminalCommand,
  useReloadOpenFilesWhenReady,
  useTerminalTabMountLifecycle,
  type PendingNamedTerminalRun,
} from "@/app-shell/center-stage-support";
import { useCenterStageTabGroups } from "@/app-shell/use-center-stage-tab-groups";
import { filterGroupedTabItemsByAllowedIds } from "@/app-shell/center-stage-tab-groups";
import { useCenterStageTerminalAgents } from "@/app-shell/use-center-stage-terminal-agents";
import { useCenterStageNamedTerminalVisibility } from "@/app-shell/use-center-stage-named-terminal-visibility";
import {
  CANVAS_TERMINAL_CLOSE_REQUEST_EVENT,
  buildCanvasTerminalPinKey,
  type CanvasTerminalCloseRequestDetail,
  dispatchCanvasTerminalPinStateChange,
  dispatchCanvasTerminalShapesRemoved,
  removeCanvasTerminalShapesFromDocument,
} from "@/features/canvas/lib/canvas-terminal-shape";
import {
  loadPinTargetDocument,
  savePinTargetDocument,
} from "@/features/canvas/hooks/use-canvas-board";
import {
  isGithubCenterTabValue,
  parseGithubCenterTabValue,
  type GithubCenterTab,
  useGithubCenterTabsStore,
} from "@/features/github/store/use-github-center-tabs";
import {
  isBrowserCenterTabValue,
  parseBrowserCenterTabValue,
  type BrowserCenterTab,
  useBrowserCenterTabsStore,
} from "@/features/browser/store/use-browser-center-tabs";
import { useBrowserTabCommandsStore } from "@/features/browser/store/use-browser-tab-commands";
import { requestBrowserContextUrlFocus } from "@/features/browser/lib/browser-url-focus";
import {
  DEFAULT_PREVIEW_BROWSER_PREFS,
  type PreviewBrowserPrefs,
} from "@/features/browser/lib/browser-labels";
import { useConnectionStore } from "@/features/connection/store/connection-store";
import { useUiPrefStore } from "@/shared/stores/use-ui-pref-store";
import { CenterStageSurface } from "@/app-shell/center-stage-chrome";
import {
  CENTER_STAGE_CARD_CLASS,
  CENTER_STAGE_GUTTER_CLASS,
  CENTER_STAGE_SHELL_CLASS,
} from "@/app-shell/sidebar-layout-constants";
import { cn } from "@/shared/lib/utils";

const EMPTY_GITHUB_TABS: GithubCenterTab[] = [];
const EMPTY_BROWSER_TABS: BrowserCenterTab[] = [];

const CenterStage: React.FC = () => {
  const t = useTranslations("appShell.centerStage");
  const tabBarT = useTranslations("appShell.centerStageTabBar");
  const githubTabsT = useTranslations("github.centerTabs");
  usePrewarmCodeLanguages();
  const router = useAppRouter();

  const [fileToClose, setFileToClose] = React.useState<OpenFile | null>(null);
  const terminalGridRef = React.useRef<TerminalGridHandle>(null);
  const terminalGridRefs = React.useRef<Record<string, TerminalGridHandle | null>>({});
  const [mountedTerminalTabsByContext, setMountedTerminalTabsByContext] = React.useState<Record<string, string[]>>({});
  const scrollableTabsRef = React.useRef<HTMLDivElement>(null);
  const projectWikiTerminalGridRef = React.useRef<TerminalGridHandle>(null);
  const [projectWikiPendingCommand, setProjectWikiPendingCommand] =
    React.useState<PendingNamedTerminalRun | null>(null);
  const [projectWikiCloseConfirmOpen, setProjectWikiCloseConfirmOpen] = React.useState(false);
  const [wikiRefreshTrigger, setWikiRefreshTrigger] = React.useState(0);
  const [wikiRefreshing, setWikiRefreshing] = React.useState(false);
  const [tabContextMenu, setTabContextMenu] = React.useState<CenterTabContextMenuState>(null);
  const [tabStripOrder, setTabStripOrder] = React.useState<string[]>([]);
  const pendingCloseQueueRef = React.useRef<PendingCenterTabClose[]>([]);
  /** True while we intentionally close a confirm dialog to advance the bulk-close queue. */
  const advancingCloseQueueRef = React.useRef(false);
  const tabGroupDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [terminalTabCloseConfirm, setTerminalTabCloseConfirm] = React.useState<{
    tabId: string;
    title: string;
    runningPaneNames: string[];
  } | null>(null);

  // Code Review tab state
  const codeReviewTerminalGridRef = React.useRef<TerminalGridHandle>(null);
  const [codeReviewPendingCommand, setCodeReviewPendingCommand] =
    React.useState<PendingNamedTerminalRun | null>(null);
  const [codeReviewCloseConfirmOpen, setCodeReviewCloseConfirmOpen] = React.useState(false);
  // codeReviewDialogOpen is managed via useDialogStore for cross-component access
  const pendingWorkspaceAgentRun = useWorkspaceCreationStore((s) => s.pendingAgentRun);
  const consumeWorkspaceAgentRun = useWorkspaceCreationStore((s) => s.consumeAgentRun);

  // Wait for editor store hydration to avoid SSR mismatch
  const isEditorHydrated = useEditorStoreHydration();

  const {
    workspaceId: liveWorkspaceId,
    projectId: liveProjectIdFromUrl,
    effectiveContextId: liveEffectiveContextId,
    currentView,
  } = useContextParams();
  // IMP-013: heavy tab/file/terminal rebind follows deferred IDs.
  // Live IDs stay for promote + paint so the left sidebar's urgent
  // URL update is not stuck behind a multi-frame center commit.
  const workspaceId = React.useDeferredValue(liveWorkspaceId);
  const projectIdFromUrl = React.useDeferredValue(liveProjectIdFromUrl);
  const effectiveContextId = React.useDeferredValue(liveEffectiveContextId);
  const isCenterContextSettled =
    workspaceId === liveWorkspaceId &&
    projectIdFromUrl === liveProjectIdFromUrl &&
    effectiveContextId === liveEffectiveContextId;

  const githubTabs = useGithubCenterTabsStore((state) =>
    effectiveContextId
      ? state.tabsByContext[effectiveContextId] ?? EMPTY_GITHUB_TABS
      : EMPTY_GITHUB_TABS,
  );
  const openGithubPullRequest = useGithubCenterTabsStore(
    (state) => state.openPullRequest,
  );
  const openGithubIssue = useGithubCenterTabsStore((state) => state.openIssue);
  const openGithubActionRun = useGithubCenterTabsStore(
    (state) => state.openActionRun,
  );
  const openGithubCommit = useGithubCenterTabsStore(
    (state) => state.openCommit,
  );
  const closeGithubTab = useGithubCenterTabsStore((state) => state.closeTab);
  const browserTabs = useBrowserCenterTabsStore((state) =>
    effectiveContextId
      ? state.tabsByContext[effectiveContextId] ?? EMPTY_BROWSER_TABS
      : EMPTY_BROWSER_TABS,
  );
  const openBrowserCenterTab = useBrowserCenterTabsStore((state) => state.openBrowser);
  const reuseOrOpenBrowser = useBrowserCenterTabsStore((state) => state.reuseOrOpenBrowser);
  const closeBrowserCenterTab = useBrowserCenterTabsStore((state) => state.closeBrowser);
  const selectBrowserInternalTab = useBrowserTabCommandsStore((state) => state.selectTab);
  const closeBrowserInternalTab = useBrowserTabCommandsStore((state) => state.closeTab);
  const activeInstanceId = useConnectionStore((state) => state.activeInstanceId);
  React.useEffect(() => {
    useUiPrefStore
      .getState()
      .readSlice(activeInstanceId, "previewBrowser", DEFAULT_PREVIEW_BROWSER_PREFS);
  }, [activeInstanceId]);
  const previewBrowserPrefs = useUiPrefStore((state) => {
    const cached = state.byInstance[activeInstanceId]?.previewBrowser;
    return (cached as PreviewBrowserPrefs | undefined) ?? DEFAULT_PREVIEW_BROWSER_PREFS;
  });
  const browserTabsT = useTranslations("appShell.centerStageTabGroups");
  const browserFallbackLabel = browserTabsT("browser.newTab");
  const {
    terminalTabs,
    createTerminalTab,
    closeTerminalTab,
    removeTerminal,
    setActiveTerminalTab,
    setTabCustomTitle,
    primeWorkspace,
    evictWorkspaceRuntime,
  } = useTerminalStore(
    useShallow((state) => ({
      terminalTabs: effectiveContextId
        ? state.workspaceTerminalTabs[effectiveContextId]
        : undefined,
      createTerminalTab: state.createTerminalTab,
      closeTerminalTab: state.closeTerminalTab,
      removeTerminal: state.removeTerminal,
      setActiveTerminalTab: state.setActiveTerminalTab,
      setTabCustomTitle: state.setTabCustomTitle,
      primeWorkspace: state.primeWorkspace,
      evictWorkspaceRuntime: state.evictWorkspaceRuntime,
    }))
  );
  const isTerminalWorkspaceReady = useTerminalStore((state) => {
    if (!effectiveContextId) return false;
    const isProjectContext =
      state.workspaceContexts[effectiveContextId] ?? currentView === "project";
    const workspaceScopeKey = getTerminalWorkspaceScopeKey(effectiveContextId, isProjectContext);
    const contextTerminalTabs = state.workspaceTerminalTabs[effectiveContextId];
    const hasNoTerminalTabs = Array.isArray(contextTerminalTabs) && contextTerminalTabs.length === 0;
    return (
      state.loadedWorkspaces.has(workspaceScopeKey) &&
      (hasNoTerminalTabs || state.hydratedTerminalScopes.has(effectiveContextId))
    );
  });
  // Reactive per-workspace last active terminal (used when URL tab is not valid for this context).
  const workspaceActiveTerminalTabId = useTerminalStore((state) => {
    if (!effectiveContextId) return null;
    return state.getActiveTerminalTabId(effectiveContextId);
  });
  const setupProgressMap = useProjectStore((s) => s.setupProgress);
  const currentSetupProgress = workspaceId ? setupProgressMap[workspaceId] : null;
  const isSetupBlocking = isWorkspaceSetupBlocking(currentSetupProgress);
  const visibleTerminalTabs = React.useMemo(
    () => terminalTabs ?? [{ id: FIXED_TERMINAL_TAB_VALUE, title: t("fallbackTerminalTitle"), closable: true }],
    [t, terminalTabs]
  );
  // Prefer the workspace's remembered active terminal over always defaulting to the first tab.
  const fallbackCenterTab =
    (workspaceActiveTerminalTabId &&
    visibleTerminalTabs.some((tab) => tab.id === workspaceActiveTerminalTabId)
      ? workspaceActiveTerminalTabId
      : visibleTerminalTabs[0]?.id) ?? "overview";
  const mountedTerminalTabs = React.useMemo(
    () => (effectiveContextId ? mountedTerminalTabsByContext[effectiveContextId] ?? [] : []),
    [effectiveContextId, mountedTerminalTabsByContext]
  );
  // When the workspace/project context changes, hold off on persisting the transient
  // fallback tab until we've tried to restore the last active center tab for that context.
  // `restoringCenterTabToRef` tracks an in-flight restore target so we do not persist the
  // fallback while nuqs/URL (or setActiveFile) is still catching up.
  const pendingCenterTabRestoreContextRef = React.useRef<string | null>(null);
  const restoringCenterTabToRef = React.useRef<string | null>(null);
  const lastSeenCenterContextIdRef = React.useRef<string | null | undefined>(undefined);
  if (lastSeenCenterContextIdRef.current !== effectiveContextId) {
    lastSeenCenterContextIdRef.current = effectiveContextId;
    pendingCenterTabRestoreContextRef.current = effectiveContextId;
    restoringCenterTabToRef.current = null;
  }

  const centerWikiTabEnabled = useExperimentSettingsStore((s) => s.centerWikiTabEnabled);
  const automationsEnabled = useExperimentSettingsStore((s) => s.automationsEnabled);
  const experimentPrefsLoaded = useExperimentSettingsStore((s) => s.loaded);
  const loadExperimentSettings = useExperimentSettingsStore((s) => s.loadSettings);
  React.useEffect(() => {
    void loadExperimentSettings();
  }, [loadExperimentSettings]);

  // --- URL-synced tab state ---
  const [{ tab: tabFromUrl, wikiPage: wikiPageFromUrl, terminalTmux }, setUrlParams] = useQueryStates(centerStageParams);

  const redirectMissingNamedTerminalTab = React.useCallback(() => {
    setUrlParams({ tab: fallbackCenterTab });
  }, [fallbackCenterTab, setUrlParams]);

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

  const simulatorTabVisible = useSimulatorCenterTabStore((s) =>
    effectiveContextId ? Boolean(s.visibleByContext[effectiveContextId]) : false,
  ) || tabFromUrl === SIMULATOR_TAB_VALUE;
  const openSimulatorTab = useSimulatorCenterTabStore((s) => s.open);
  const closeSimulatorTab = useSimulatorCenterTabStore((s) => s.close);

  const gitHistoryTabVisible = useGitHistoryCenterTabStore((s) =>
    effectiveContextId ? Boolean(s.visibleByContext[effectiveContextId]) : false,
  ) || tabFromUrl === GIT_HISTORY_TAB_VALUE;
  const openGitHistoryTab = useGitHistoryCenterTabStore((s) => s.open);
  const closeGitHistoryTab = useGitHistoryCenterTabStore((s) => s.close);
  const toolTabsVisibleByContext = useToolCenterTabsStore((s) => s.visibleByContext);
  const openToolTab = useToolCenterTabsStore((s) => s.open);
  const closeToolTab = useToolCenterTabsStore((s) => s.close);
  const changesTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.changes) ||
    tabFromUrl === "changes";
  const reviewTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.review) ||
    tabFromUrl === "review";
  const runTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.run) ||
    tabFromUrl === "run";
  const githubHubTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.github) ||
    tabFromUrl === "github";
  const filesTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.files) ||
    tabFromUrl === "files";
  const ptDesignTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.["pt-design"]) ||
    tabFromUrl === "pt-design";

  React.useEffect(() => {
    if (tabFromUrl === SIMULATOR_TAB_VALUE && effectiveContextId) {
      openSimulatorTab(effectiveContextId);
    }
  }, [effectiveContextId, openSimulatorTab, tabFromUrl]);

  React.useEffect(() => {
    if (tabFromUrl === GIT_HISTORY_TAB_VALUE && effectiveContextId) {
      openGitHistoryTab(effectiveContextId);
    }
  }, [effectiveContextId, openGitHistoryTab, tabFromUrl]);

  React.useEffect(() => {
    if (isCenterToolTabValue(tabFromUrl) && effectiveContextId) {
      openToolTab(effectiveContextId, tabFromUrl);
    }
  }, [effectiveContextId, openToolTab, tabFromUrl]);

  /** Until experiment prefs load, preserve `tab=wiki` from the URL so we do not strip deep links. */
  const wikiCenterEligible = React.useMemo(() => {
    if (experimentPrefsLoaded) return centerWikiTabEnabled;
    return tabFromUrl === "wiki";
  }, [experimentPrefsLoaded, centerWikiTabEnabled, tabFromUrl]);

  const resolvedTab = React.useMemo(() => {
    if (tabFromUrl === "wiki" && experimentPrefsLoaded && !centerWikiTabEnabled) {
      return fallbackCenterTab;
    }
    if (tabFromUrl === "project-wiki" && !projectWikiTabVisible) return fallbackCenterTab;
    if (tabFromUrl === "code-review" && !codeReviewTabVisible) return fallbackCenterTab;
    if (tabFromUrl === SIMULATOR_TAB_VALUE) return SIMULATOR_TAB_VALUE;
    if (tabFromUrl === GIT_HISTORY_TAB_VALUE) return GIT_HISTORY_TAB_VALUE;
    if (isCenterToolTabValue(tabFromUrl)) return tabFromUrl;
    if (isTerminalCenterTabValue(tabFromUrl)) {
      return visibleTerminalTabs.some((tab) => tab.id === tabFromUrl)
        ? tabFromUrl
        : fallbackCenterTab;
    }
    if (isGithubCenterTabValue(tabFromUrl)) {
      const target = parseGithubCenterTabValue(tabFromUrl);
      return target?.contextId === effectiveContextId
        ? tabFromUrl
        : fallbackCenterTab;
    }
    if (isBrowserCenterTabValue(tabFromUrl)) {
      const target = parseBrowserCenterTabValue(tabFromUrl);
      return target?.contextId === effectiveContextId &&
        browserTabs.some((tab) => tab.value === tabFromUrl)
        ? tabFromUrl
        : fallbackCenterTab;
    }
    return tabFromUrl;
  }, [
    tabFromUrl,
    experimentPrefsLoaded,
    centerWikiTabEnabled,
    projectWikiTabVisible,
    codeReviewTabVisible,
    simulatorTabVisible,
    gitHistoryTabVisible,
    effectiveContextId,
    fallbackCenterTab,
    visibleTerminalTabs,
    browserTabs,
  ]);

  React.useEffect(() => {
    if (!experimentPrefsLoaded || centerWikiTabEnabled || tabFromUrl !== "wiki") return;
    setUrlParams({ tab: fallbackCenterTab, wikiPage: null });
  }, [experimentPrefsLoaded, centerWikiTabEnabled, fallbackCenterTab, tabFromUrl, setUrlParams]);

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
  const projects = useProjects();
  const clearSetupProgress = useProjectStore(s => s.clearSetupProgress);
  const centerStageRepoPath = useGitStore((s) => s.currentRepoPath);
  const setCurrentRepoPath = useGitStore((s) => s.setCurrentRepoPath);
  const currentProjectPath = useEditorStore((s) => s.currentProjectPath);
  const statusQuery = useGitStatusQuery(centerStageRepoPath);
  const currentBranch = statusQuery.data?.current_branch ?? null;
  const githubOwner = statusQuery.data?.github_owner ?? null;
  const githubRepo = statusQuery.data?.github_repo ?? null;

  /**
   * Assigned after `activateNextAfterClosing` is defined. Close handlers above
   * that point call through this ref so we can keep MRU navigation without
   * reordering half of CenterStage.
   */
  const activateNextAfterClosingRef = React.useRef<(closed: string | string[]) => void>(
    () => {},
  );

  const handleCloseFile = React.useCallback((file: OpenFile) => {
    if (file.isDirty) {
      setFileToClose(file);
    } else {
      closeFile(file.path);
      activateNextAfterClosingRef.current(file.path);
    }
  }, [closeFile]);

  const advancePendingCloseQueue = React.useCallback(() => {
    const next = pendingCloseQueueRef.current.shift();
    if (!next) return;
    if (next.kind === "file") {
      setFileToClose(next.file);
      return;
    }
    if (next.kind === "terminal") {
      setTerminalTabCloseConfirm({
        tabId: next.tabId,
        title: next.title,
        runningPaneNames: next.runningPaneNames,
      });
      return;
    }
    if (next.kind === "project-wiki") {
      setProjectWikiCloseConfirmOpen(true);
      return;
    }
    setCodeReviewCloseConfirmOpen(true);
  }, []);

  const cancelPendingCloseQueue = React.useCallback(() => {
    pendingCloseQueueRef.current = [];
    setFileToClose(null);
    setTerminalTabCloseConfirm(null);
    setProjectWikiCloseConfirmOpen(false);
    setCodeReviewCloseConfirmOpen(false);
  }, []);

  const dismissCloseConfirmDialog = React.useCallback(() => {
    // Ignore dialog-close events that fire when we confirm and advance the queue.
    if (advancingCloseQueueRef.current) return;
    if (pendingCloseQueueRef.current.length > 0) {
      cancelPendingCloseQueue();
      return;
    }
    setFileToClose(null);
    setTerminalTabCloseConfirm(null);
    setProjectWikiCloseConfirmOpen(false);
    setCodeReviewCloseConfirmOpen(false);
  }, [cancelPendingCloseQueue]);

  const confirmClose = React.useCallback(() => {
    if (fileToClose) {
      advancingCloseQueueRef.current = true;
      const closedPath = fileToClose.path;
      closeFile(closedPath);
      setFileToClose(null);
      activateNextAfterClosingRef.current(closedPath);
      advancePendingCloseQueue();
      queueMicrotask(() => {
        advancingCloseQueueRef.current = false;
      });
    }
  }, [advancePendingCloseQueue, closeFile, fileToClose]);

  const reviewTarget = React.useMemo((): ReviewTarget | null => {
    if (workspaceId) return { kind: "workspace", workspaceId };
    if (projectIdFromUrl) return { kind: "project", projectId: projectIdFromUrl };
    return null;
  }, [workspaceId, projectIdFromUrl]);

  const handleFinishSetup = () => {
    if (workspaceId) {
      clearSetupProgress(workspaceId);
    }
  };

  // Sync editor workspace id only after deferred center settles (IMP-013).
  React.useEffect(() => {
    if (!isCenterContextSettled) return;
    return scheduleAfterPaint(() => {
      setWorkspaceId(effectiveContextId);
    });
  }, [effectiveContextId, isCenterContextSettled, setWorkspaceId]);

  React.useEffect(() => {
    if (!isCenterContextSettled) return;
    return scheduleAfterPaint(() => {
      setCurrentRepoPath(isSetupBlocking ? null : currentProjectPath || null);
    });
  }, [currentProjectPath, isCenterContextSettled, isSetupBlocking, setCurrentRepoPath]);

  // Load per-workspace tab strip drag order when the center context changes.
  React.useEffect(() => {
    if (!effectiveContextId) {
      setTabStripOrder([]);
      return;
    }
    setTabStripOrder(readCenterStageTabStripOrder(effectiveContextId));
  }, [effectiveContextId]);

  const handleTabStripOrderChange = React.useCallback(
    (order: string[]) => {
      setTabStripOrder(order);
      if (effectiveContextId) {
        writeCenterStageTabStripOrder(effectiveContextId, order);
      }
    },
    [effectiveContextId],
  );

  const openFiles = getOpenFiles(effectiveContextId || undefined);
  const activeFilePath = getActiveFilePath(effectiveContextId || undefined);

  // activeValue 优先使用打开的文件路径，否则使用当前 center tab
  const activeValue = activeFilePath || resolvedTab;
  const activeValueRef = React.useRef(activeValue);
  activeValueRef.current = activeValue;
  /** Set after handleCenterStageTabChange is defined; used by close handlers above it. */
  const navigateCenterTabRef = React.useRef<(val: string) => void>(() => {});

  const collectOpenCenterTabValues = React.useCallback(
    (exclude?: Iterable<string>) =>
      buildOpenCenterTabValues({
        openFilePaths: openFiles.map((file) => file.path),
        terminalTabIds: visibleTerminalTabs.map((tab) => tab.id),
        githubTabValues: githubTabs.map((tab) => tab.value),
        browserTabValues: browserTabs.map((tab) => tab.value),
        projectWikiVisible: projectWikiTabVisible,
        codeReviewVisible: codeReviewTabVisible,
        simulatorVisible: simulatorTabVisible,
        gitHistoryVisible: gitHistoryTabVisible,
        changesVisible: changesTabVisible,
        reviewVisible: reviewTabVisible,
        runVisible: runTabVisible,
        githubHubVisible: githubHubTabVisible,
        filesVisible: filesTabVisible,
        ptDesignVisible: ptDesignTabVisible,
        wikiEnabled: centerWikiTabEnabled,
        exclude,
      }),
    [
      browserTabs,
      centerWikiTabEnabled,
      codeReviewTabVisible,
      githubTabs,
      openFiles,
      projectWikiTabVisible,
      simulatorTabVisible,
      gitHistoryTabVisible,
      changesTabVisible,
      reviewTabVisible,
      runTabVisible,
      githubHubTabVisible,
      filesTabVisible,
      ptDesignTabVisible,
      visibleTerminalTabs,
    ],
  );

  /**
   * After closing one or more tabs: prune the MRU stack, and if the active tab
   * was among them, navigate to the most recently activated still-open tab.
   */
  const activateNextAfterClosing = React.useCallback(
    (closedValues: string | string[]) => {
      if (!effectiveContextId) return;
      const closedList = Array.isArray(closedValues) ? closedValues : [closedValues];
      if (closedList.length === 0) return;

      for (const value of closedList) {
        removeCenterTabFromActivationStack(effectiveContextId, value);
      }

      const active = activeValueRef.current;
      if (!closedList.includes(active)) return;

      const open = collectOpenCenterTabValues(closedList);
      // Prefer store-fresh terminal ids after close (hook list may lag one frame).
      const liveTerminalIds = useTerminalStore
        .getState()
        .getTerminalTabs(effectiveContextId)
        .map((tab) => tab.id);
      for (const id of liveTerminalIds) open.add(id);
      for (const value of closedList) open.delete(value);

      const next =
        pickNextCenterTabFromActivationStack(effectiveContextId, open) ??
        (open.has(fallbackCenterTab) ? fallbackCenterTab : null) ??
        (liveTerminalIds[0] ?? "overview");

      if (next && next !== active) {
        navigateCenterTabRef.current(next);
      } else if (!open.has(active)) {
        navigateCenterTabRef.current(liveTerminalIds[0] ?? "overview");
      }
    },
    [collectOpenCenterTabValues, effectiveContextId, fallbackCenterTab],
  );
  activateNextAfterClosingRef.current = activateNextAfterClosing;

  React.useEffect(() => {
    const target = parseGithubCenterTabValue(tabFromUrl);
    if (
      !target ||
      !effectiveContextId ||
      target.contextId !== effectiveContextId ||
      githubTabs.some((tab) => tab.value === tabFromUrl) ||
      !githubOwner ||
      !githubRepo
    ) {
      return;
    }

    if (target.kind === "github-pr") {
      if (!currentBranch) return;
      openGithubPullRequest(effectiveContextId, {
        branch: currentBranch,
        label: githubTabsT("pullRequest", { number: Number(target.itemId) }),
        owner: githubOwner,
        prNumber: Number(target.itemId),
        repo: githubRepo,
      });
      return;
    }

    if (target.kind === "github-issue") {
      openGithubIssue(effectiveContextId, {
        label: githubTabsT("issue", { number: Number(target.itemId) }),
        owner: githubOwner,
        repo: githubRepo,
        issueNumber: Number(target.itemId),
      });
      return;
    }

    if (target.kind === "github-action") {
      openGithubActionRun(effectiveContextId, {
        label: githubTabsT("actionRun", { number: Number(target.itemId) }),
        owner: githubOwner,
        repo: githubRepo,
        run: null,
        runId: Number(target.itemId),
      });
      return;
    }

    // github-commit: auto-open from URL
    openGithubCommit(effectiveContextId, {
      label: target.itemId.substring(0, 7),
      owner: githubOwner,
      repo: githubRepo,
      sha: target.itemId,
      subject: target.itemId.substring(0, 7),
      authorName: "",
    });
  }, [
    currentBranch,
    effectiveContextId,
    githubOwner,
    githubRepo,
    githubTabs,
    githubTabsT,
    openGithubActionRun,
    openGithubCommit,
    openGithubIssue,
    openGithubPullRequest,
    tabFromUrl,
  ]);

  const handleCloseGithubTab = React.useCallback(
    (value: string) => {
      if (!effectiveContextId) return;
      closeGithubTab(effectiveContextId, value);
      activateNextAfterClosing(value);
    },
    [activateNextAfterClosing, closeGithubTab, effectiveContextId],
  );

  const handleCloseBrowserTab = React.useCallback(
    (value: string) => {
      if (!effectiveContextId) return;
      closeBrowserCenterTab(effectiveContextId, value);
      activateNextAfterClosing(value);
    },
    [activateNextAfterClosing, closeBrowserCenterTab, effectiveContextId],
  );

  const handleCreateBrowserCenterTab = React.useCallback(() => {
    if (!effectiveContextId) return;
    const tab = openBrowserCenterTab(effectiveContextId);
    requestBrowserContextUrlFocus(tab.browserContextId);
    setActiveFile(null, effectiveContextId);
    void setUrlParams({ tab: tab.value, wikiPage: null });
    // Attach exclusively to the focused multi-pane slot (not via URL effect).
    useCenterPaneLayoutStore.getState().openTab(effectiveContextId, tab.value);
  }, [effectiveContextId, openBrowserCenterTab, setActiveFile, setUrlParams]);

  const handleCreateSimulatorCenterTab = React.useCallback(() => {
    if (!effectiveContextId) return;
    openSimulatorTab(effectiveContextId);
    setActiveFile(null, effectiveContextId);
    void setUrlParams({ tab: SIMULATOR_TAB_VALUE, wikiPage: null });
    useCenterPaneLayoutStore.getState().openTab(effectiveContextId, SIMULATOR_TAB_VALUE);
  }, [effectiveContextId, openSimulatorTab, setActiveFile, setUrlParams]);

  const handleCloseSimulatorTab = React.useCallback(() => {
    if (!effectiveContextId) return;
    closeSimulatorTab(effectiveContextId);
    void simulatorApi.stop(effectiveContextId).catch(() => {});
    activateNextAfterClosing(SIMULATOR_TAB_VALUE);
  }, [activateNextAfterClosing, closeSimulatorTab, effectiveContextId]);

  const handleCloseGitHistoryTab = React.useCallback(() => {
    if (!effectiveContextId) return;
    closeGitHistoryTab(effectiveContextId);
    activateNextAfterClosing(GIT_HISTORY_TAB_VALUE);
  }, [activateNextAfterClosing, closeGitHistoryTab, effectiveContextId]);

  const handleCreateToolCenterTab = React.useCallback((tab: CenterToolTabValue) => {
    if (!effectiveContextId) return;
    openToolTab(effectiveContextId, tab);
    setActiveFile(null, effectiveContextId);
    void setUrlParams({ tab, wikiPage: null });
    // Exclusive attach so Files/Changes/etc. land on the focused pane only.
    useCenterPaneLayoutStore.getState().openTab(effectiveContextId, tab);
  }, [effectiveContextId, openToolTab, setActiveFile, setUrlParams]);

  const handleCloseToolTab = React.useCallback((tab: CenterToolTabValue) => {
    if (!effectiveContextId) return;
    closeToolTab(effectiveContextId, tab);
    activateNextAfterClosing(tab);
  }, [activateNextAfterClosing, closeToolTab, effectiveContextId]);

  React.useEffect(() => {
    registerBrowserHostChrome({
      showCenterBrowser: (contextId) => {
        const tab = reuseOrOpenBrowser(contextId);
        setActiveFile(null, contextId);
        void setUrlParams({ tab: tab.value, wikiPage: null });
      },
    });
  }, [reuseOrOpenBrowser, setActiveFile, setUrlParams]);

  // Promote / sticky leave track the live URL so warm membership is not deferred.
  useTerminalTabMountLifecycle({
    activeValue,
    effectiveContextId: liveEffectiveContextId,
    setMountedTerminalTabsByContext,
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

  // Cold hydrate only after deferred center caught up — never on the hop frame.
  React.useEffect(() => {
    if (!isCenterContextSettled || !effectiveContextId) return;
    return scheduleIdle(() => {
      primeWorkspace(effectiveContextId, currentView === "project");
    }, 250);
  }, [currentView, effectiveContextId, isCenterContextSettled, primeWorkspace]);

  // Restore the last active center tab when switching workspace/project context,
  // then persist the settled selection. Must not persist the transient fallback tab
  // (first terminal / URL mismatch) before restore runs — that clobbers the saved tab.
  // Wait for deferred context so restore URL writes do not stack on the hop frame.
  React.useEffect(() => {
    if (!isCenterContextSettled || !effectiveContextId || !activeValue) return;

    if (pendingCenterTabRestoreContextRef.current === effectiveContextId) {
      const restoreTarget = restoringCenterTabToRef.current;

      // Waiting for a previously issued restore to land on activeValue.
      if (restoreTarget) {
        if (activeValue === restoreTarget || activeFilePath === restoreTarget) {
          restoringCenterTabToRef.current = null;
          pendingCenterTabRestoreContextRef.current = null;
        } else {
          const restoreFailed =
            (restoreTarget === "wiki" && experimentPrefsLoaded && !centerWikiTabEnabled) ||
            (restoreTarget === "project-wiki" &&
              !projectWikiTabVisible &&
              tabFromUrl !== "project-wiki") ||
            (restoreTarget === "code-review" &&
              !codeReviewTabVisible &&
              tabFromUrl !== "code-review") ||
            (isTerminalCenterTabValue(restoreTarget) &&
              isTerminalWorkspaceReady &&
              !visibleTerminalTabs.some((tab) => tab.id === restoreTarget)) ||
            (isGithubCenterTabValue(restoreTarget) &&
              !githubTabs.some((tab) => tab.value === restoreTarget)) ||
            (isBrowserCenterTabValue(restoreTarget) &&
              !browserTabs.some((tab) => tab.value === restoreTarget));

          if (!restoreFailed) {
            return;
          }
          restoringCenterTabToRef.current = null;
          pendingCenterTabRestoreContextRef.current = null;
        }
      } else if (activeFilePath) {
        // An active file for this workspace is itself the restored surface.
        pendingCenterTabRestoreContextRef.current = null;
      } else if (shouldSkipLastTabRestoreForUrlTab(tabFromUrl)) {
        // Deep link / e2e `?tab=changes` wins over a persisted last tab (`files`).
        pendingCenterTabRestoreContextRef.current = null;
      } else {
        const last = readCenterStageLastTab(effectiveContextId);
        if (!last || last === activeValue) {
          pendingCenterTabRestoreContextRef.current = null;
        } else if (FIXED_TABS.has(last)) {
          if (last === "wiki" && experimentPrefsLoaded && !centerWikiTabEnabled) {
            pendingCenterTabRestoreContextRef.current = null;
          } else {
            restoringCenterTabToRef.current = last;
            setFixedTab(last as FixedTab);
            return;
          }
        } else if (isTerminalCenterTabValue(last)) {
          // APP-043: non-blocking restore — push last tab chrome immediately; do not wait hydrate.
          const plan = planTerminalLastTabRestore({
            lastTab: last,
            visibleTerminalTabIds: visibleTerminalTabs.map((tab) => tab.id),
            isTerminalWorkspaceReady,
          });
          if (plan.shouldPushUrl && plan.tabToPush) {
            restoringCenterTabToRef.current = plan.tabToPush;
            setUrlParams({ tab: plan.tabToPush, wikiPage: null });
          }
          if (plan.settlePending && !visibleTerminalTabs.some((tab) => tab.id === last)) {
            restoringCenterTabToRef.current = null;
            pendingCenterTabRestoreContextRef.current = null;
          }
          return;
        } else if (githubTabs.some((tab) => tab.value === last)) {
          restoringCenterTabToRef.current = last;
          setUrlParams({ tab: last, wikiPage: null });
          return;
        } else if (browserTabs.some((tab) => tab.value === last)) {
          restoringCenterTabToRef.current = last;
          setUrlParams({ tab: last, wikiPage: null });
          return;
        } else if (openFiles.some((f) => f.path === last)) {
          restoringCenterTabToRef.current = last;
          setActiveFile(last, effectiveContextId);
          return;
        } else if (!isEditorHydrated) {
          // openFiles may still be empty before editor prefs hydrate.
          return;
        } else {
          // Saved tab no longer exists (closed file / terminal / etc.).
          pendingCenterTabRestoreContextRef.current = null;
        }
      }
    }

    setCenterStageLastTab(effectiveContextId, activeValue);
    recordCenterTabActivation(effectiveContextId, activeValue);
    if (isTerminalCenterTabValue(activeValue)) {
      setActiveTerminalTab(effectiveContextId, activeValue);
    }
  }, [
    effectiveContextId,
    activeFilePath,
    activeValue,
    browserTabs,
    centerWikiTabEnabled,
    codeReviewTabVisible,
    experimentPrefsLoaded,
    githubTabs,
    isCenterContextSettled,
    isEditorHydrated,
    isTerminalWorkspaceReady,
    openFiles,
    projectWikiTabVisible,
    setActiveFile,
    setActiveTerminalTab,
    setFixedTab,
    setUrlParams,
    tabFromUrl,
    visibleTerminalTabs,
  ]);

  const { defaultAgentId, terminalQuickOpenAgents } = useCenterStageTerminalAgents(isSetupBlocking);

  const ensureRunnableTerminalTab = React.useCallback(() => {
    if (!effectiveContextId) return null;
    const existingTab = useTerminalStore.getState().getTerminalTabs(effectiveContextId)[0];
    return existingTab?.id ?? createTerminalTab(effectiveContextId).id;
  }, [createTerminalTab, effectiveContextId]);

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
      currentView === "project",
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
      (currentView !== "workspace" && currentView !== "project") ||
      isSetupBlocking ||
      !isTerminalWorkspaceReady ||
      (pendingWorkspaceAgentRun?.workspaceId ?? pendingWorkspaceAgentRun?.projectId) !== effectiveContextId
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
    const plan =
      pending.command?.trim()
        ? {
            launchCommand: pending.command.trim(),
            tuiFollowUpPrompt: undefined,
          }
        : buildInteractiveAgentRunPlan({
            agentId: selectedAgent.agent.id,
            launchCommand: selectedAgent.command.trim(),
            prompt,
            runConfig: pending.agentRunConfig,
          });

    const targetTerminalTabId = ensureRunnableTerminalTab();
    if (!targetTerminalTabId) return;
    setActiveFile(null, effectiveContextId);
    setActiveTerminalTab(effectiveContextId, targetTerminalTabId);
    setUrlParams({ tab: targetTerminalTabId, wikiPage: null });
    runWhenTerminalGridReady(targetTerminalTabId, (grid) => {
      void grid.createAndRunTerminal({
        label: selectedAgent.agent.label,
        command: plan.launchCommand,
        tuiFollowUpPrompt: plan.tuiFollowUpPrompt,
        agent: selectedAgent.agent,
      });
    }, 40);
  }, [
    consumeWorkspaceAgentRun,
    currentView,
    defaultAgentId,
    effectiveContextId,
    ensureRunnableTerminalTab,
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
      const targetTerminalTabId = ensureRunnableTerminalTab();
      if (!targetTerminalTabId) return;
      setActiveTerminalTab(effectiveContextId, targetTerminalTabId);
      setUrlParams({ tab: targetTerminalTabId, wikiPage: null });
      runWhenTerminalGridReady(targetTerminalTabId, (grid) => {
        void grid.createAndRunTerminal({ label, command });
      });
    },
    [activeFilePath, effectiveContextId, ensureRunnableTerminalTab, runWhenTerminalGridReady, setActiveFile, setActiveTerminalTab, setUrlParams],
  );

  React.useEffect(() => {
    useReviewTerminalRunnerStore.getState().setRunner(handleRunReviewInTerminal);
    return () => {
      useReviewTerminalRunnerStore.getState().setRunner(null);
    };
  }, [handleRunReviewInTerminal]);

  const handleRunAgentFixInTerminal = React.useCallback(
    async (request: ResolvedAgentFixLaunchRequest) => {
      if (!effectiveContextId || effectiveContextId !== request.context.contextId) {
        throw new Error("Agent Fix context is no longer active.");
      }
      if (
        (request.context.scope === "workspace" && currentView !== "workspace") ||
        (request.context.scope === "project" && currentView !== "project")
      ) {
        throw new Error("Agent Fix must run in its source workspace or project.");
      }
      if (activeFilePath) {
        setActiveFile(null, effectiveContextId);
      }

      const { currentProject: fixProject, currentWorkspace: fixWorkspace } =
        resolveCenterStageProjectContext(projects, effectiveContextId);
      const launchPrompt = await resolveAgentFixLaunchPrompt(
        request.prompt,
        fixWorkspace?.localPath || fixProject?.mainFilePath,
      );

      const nextTab = createTerminalTab(effectiveContextId, {
        title: request.terminalTabTitle,
      });
      setActiveTerminalTab(effectiveContextId, nextTab.id);
      setUrlParams({ tab: nextTab.id, wikiPage: null });

      const plan = buildInteractiveAgentRunPlan({
        agentId: request.agent.id,
        launchCommand: request.agent.launchCommand.trim(),
        prompt: launchPrompt,
        runConfig: request.runConfig,
      });

      runWhenTerminalGridReady(
        nextTab.id,
        (grid) => {
          void grid.createAndRunTerminal({
            label: request.terminalPaneLabel,
            command: plan.launchCommand,
            tuiFollowUpPrompt: plan.tuiFollowUpPrompt,
            agent: {
              id: request.agent.id,
              label: request.agent.label,
              command: request.agent.command,
              iconType: request.agent.iconType,
            },
          });
        },
        40,
      );
    },
    [
      activeFilePath,
      createTerminalTab,
      currentView,
      effectiveContextId,
      projects,
      runWhenTerminalGridReady,
      setActiveFile,
      setActiveTerminalTab,
      setUrlParams,
    ],
  );

  React.useEffect(() => {
    useAgentFixLauncherStore.getState().setRunner(handleRunAgentFixInTerminal);
    return () => {
      useAgentFixLauncherStore.getState().setRunner(null);
    };
  }, [handleRunAgentFixInTerminal]);

  const handleCreateTerminalCenterTab = React.useCallback(() => {
    if (!effectiveContextId) return;
    const nextTab = createTerminalTab(effectiveContextId);
    setActiveTerminalTab(effectiveContextId, nextTab.id);
    setUrlParams({ tab: nextTab.id, wikiPage: null });
    setActiveFile(null, effectiveContextId);
    // New terminal id always attaches to the focused pane (isolated from siblings).
    useCenterPaneLayoutStore.getState().openTab(effectiveContextId, nextTab.id);

    // Await prefs before resolving the default agent so a cold mount does not
    // launch a plain shell while disk prefs still say "apply to new tab".
    void (async () => {
      await useTerminalSplitPrefsStore.getState().loadSettings();
      const splitPrefs = useTerminalSplitPrefsStore.getState();
      const defaultAgent =
        splitPrefs.enabled && splitPrefs.applyToNewTerminalTab
          ? resolveDefaultSplitAgent(splitPrefs, terminalQuickOpenAgents)
          : null;

      runWhenTerminalGridReady(nextTab.id, (grid) => {
        if (defaultAgent) {
          void grid.createAndRunTerminal({
            label: defaultAgent.agent.label,
            command: defaultAgent.command,
            agent: defaultAgent.agent,
          });
          return;
        }
        grid.focusActivePane();
      });
    })();
  }, [
    effectiveContextId,
    createTerminalTab,
    runWhenTerminalGridReady,
    setActiveFile,
    setActiveTerminalTab,
    setUrlParams,
    terminalQuickOpenAgents,
  ]);

  const handleRenameTerminalCenterTab = React.useCallback((tabId: string, title: string) => {
    if (!effectiveContextId) return;
    setTabCustomTitle(effectiveContextId, tabId, title);
  }, [effectiveContextId, setTabCustomTitle]);

  const cleanupCanvasTerminalsForClosedTerminal = React.useCallback(async ({
    contextScope,
    pinKeys,
    sourceTerminalTabIds,
    tmuxWindowNames,
    workspaceId,
  }: {
    contextScope: "project" | "workspace";
    pinKeys: string[];
    sourceTerminalTabIds?: string[];
    tmuxWindowNames?: string[];
    workspaceId: string;
  }) => {
    try {
      const { fileName, document } = await loadPinTargetDocument();
      const result = removeCanvasTerminalShapesFromDocument(document.tldrawDocument, {
        contextScope,
        workspaceId,
        sourceTerminalTabIds,
        pinKeys,
        tmuxWindowNames,
      });

      if (!result.changed) {
        return;
      }

      dispatchCanvasTerminalShapesRemoved(result.removedShapeIds);
      await savePinTargetDocument(fileName, {
        ...document,
        tldrawDocument: result.document as typeof document.tldrawDocument,
      });

      for (const pinKey of result.removedPinKeys) {
        clearLastPinnedTerminal(fileName, pinKey);
        dispatchCanvasTerminalPinStateChange(pinKey, false);
      }
    } catch (error) {
      console.warn("Failed to clean up Canvas terminals for closed terminal", error);
      toastManager.add({
        title: t("canvas.title"),
        description: t("canvas.cleanupFailed"),
        type: "error",
      });
    }
  }, [t]);

  const getTerminalGridForTab = React.useCallback((tabId: string) => {
    return tabId === FIXED_TERMINAL_TAB_VALUE
      ? terminalGridRef.current
      : terminalGridRefs.current[tabId] ?? null;
  }, []);

  const removeMountedTerminalTab = React.useCallback((contextId: string, tabId: string) => {
    if (tabId !== FIXED_TERMINAL_TAB_VALUE) {
      delete terminalGridRefs.current[tabId];
    }
    setMountedTerminalTabsByContext((current) => {
      const mountedTabs = current[contextId];
      if (!mountedTabs || !mountedTabs.includes(tabId)) {
        return current;
      }

      return {
        ...current,
        [contextId]: mountedTabs.filter((mountedTabId) => mountedTabId !== tabId),
      };
    });
  }, []);

  const getTerminalTabPanes = React.useCallback((workspaceId: string, tabId: string): TerminalPaneProps[] => {
    const terminalState = useTerminalStore.getState();
    const livePanes = Object.values(terminalState.getPanes(workspaceId, tabId));
    if (livePanes.length > 0) {
      return livePanes;
    }

    const isProjectContext =
      terminalState.workspaceContexts[workspaceId] ?? currentView === "project";
    const workspaceScopeKey = getTerminalWorkspaceScopeKey(workspaceId, isProjectContext);
    const persistedTab = terminalState.persistedTerminalLayouts[workspaceScopeKey]?.tabs.find(
      (tab) => tab.id === tabId,
    );
    return Object.values(persistedTab?.panes ?? {}) as TerminalPaneProps[];
  }, [currentView]);

  const performCloseTerminalCenterTab = React.useCallback((
    tabId: string,
    options?: { skipActivation?: boolean },
  ) => {
    if (!effectiveContextId) return;
    const terminalState = useTerminalStore.getState();
    const tabPanes = getTerminalTabPanes(effectiveContextId, tabId);
    const isProjectContext =
      terminalState.workspaceContexts[effectiveContextId] ?? currentView === "project";
    const contextScope = isProjectContext ? "project" : "workspace";
    const tmuxWindowNames = tabPanes
      .map((pane) => pane.tmuxWindowName)
      .filter((tmuxWindowName): tmuxWindowName is string => Boolean(tmuxWindowName));
    const pinKeys = tmuxWindowNames
      .map((tmuxWindowName) => buildCanvasTerminalPinKey(contextScope, effectiveContextId, tmuxWindowName));
    void cleanupCanvasTerminalsForClosedTerminal({
      contextScope,
      pinKeys,
      sourceTerminalTabIds: [tabId],
      tmuxWindowNames,
      workspaceId: effectiveContextId,
    });

    const grid = getTerminalGridForTab(tabId);
    if (grid) {
      grid.destroyAllTerminals();
    } else {
      for (const tmuxWindowName of tmuxWindowNames) {
        void systemApi.killTmuxWindow(effectiveContextId, tmuxWindowName).catch((error) => {
          console.warn("Failed to kill tmux window for closed terminal tab", error);
        });
      }
    }

    closeTerminalTab(effectiveContextId, tabId);
    removeMountedTerminalTab(effectiveContextId, tabId);
    if (!options?.skipActivation) {
      activateNextAfterClosing(tabId);
    }
  }, [
    activateNextAfterClosing,
    cleanupCanvasTerminalsForClosedTerminal,
    closeTerminalTab,
    currentView,
    effectiveContextId,
    getTerminalGridForTab,
    getTerminalTabPanes,
    removeMountedTerminalTab,
  ]);

  const buildTerminalCloseConfirmPayload = React.useCallback(
    (
      contextId: string,
      tabId: string,
      tabPanes: ReturnType<typeof getTerminalTabPanes>,
      tmuxWindows: Awaited<ReturnType<typeof systemApi.listTmuxWindows>>["windows"] | null,
    ) => {
      const store = useTerminalStore.getState();
      const tab = store.getTerminalTabs(contextId).find((item) => item.id === tabId);
      const configuredAgents = terminalQuickOpenAgents.map(({ agent }) => agent);
      const scopeKey = getScopeKey(contextId, tabId);
      const title =
        resolveTerminalCenterTabPresentation({
          fallbackTitle: tab?.title || t("fallbackTerminalTitle"),
          customTitle: tab?.customTitle,
          panes: store.getPanes(contextId, tabId),
          layout: store.getLayout(contextId, tabId),
          lastActivePaneId: store.workspaceActivePaneIds[scopeKey] ?? null,
          maximizedPaneId: store.getMaximizedTerminalId(contextId, tabId),
          configuredAgents,
          showAgentName:
            useAgentTitleSettingsStore.getState().showAgentNameInTerminalTitles,
        }).displayTitle ||
        tab?.customTitle ||
        tab?.title ||
        t("fallbackTerminalTitle");
      const runningPaneNames = tabPanes
        .filter((pane) => isTerminalPaneNonIdle(pane, tmuxWindows))
        .map((pane) => getTerminalCloseConfirmName(pane, configuredAgents));
      return { tabId, title, runningPaneNames };
    },
    [t, terminalQuickOpenAgents],
  );

  const handleCloseTerminalCenterTab = React.useCallback(async (
    tabId: string,
    options?: { force?: boolean },
  ) => {
    if (!effectiveContextId) return;

    if (!options?.force) {
      const tabPanes = getTerminalTabPanes(effectiveContextId, tabId);
      let tmuxWindows: Awaited<ReturnType<typeof systemApi.listTmuxWindows>>["windows"] | null = null;
      try {
        const response = await systemApi.listTmuxWindows(effectiveContextId);
        tmuxWindows = response.windows;
      } catch (error) {
        console.warn("Failed to inspect terminal foreground commands before tab close", error);
      }

      if (hasNonIdleTerminalPanes(tabPanes, tmuxWindows)) {
        setTerminalTabCloseConfirm(
          buildTerminalCloseConfirmPayload(
            effectiveContextId,
            tabId,
            tabPanes,
            tmuxWindows,
          ),
        );
        return;
      }
    }

    performCloseTerminalCenterTab(tabId);
  }, [
    buildTerminalCloseConfirmPayload,
    effectiveContextId,
    getTerminalTabPanes,
    performCloseTerminalCenterTab,
  ]);

  const handleConfirmCloseTerminalCenterTab = React.useCallback(() => {
    if (!terminalTabCloseConfirm) return;
    advancingCloseQueueRef.current = true;
    performCloseTerminalCenterTab(terminalTabCloseConfirm.tabId);
    setTerminalTabCloseConfirm(null);
    advancePendingCloseQueue();
    queueMicrotask(() => {
      advancingCloseQueueRef.current = false;
    });
  }, [advancePendingCloseQueue, performCloseTerminalCenterTab, terminalTabCloseConfirm]);

  /**
   * Close many center tabs: safe ones immediately; dirty files and busy terminals
   * (plus project-wiki / code-review) go through the same confirm modals as single close.
   */
  const closeTabsSafely = React.useCallback(async (tabs: CenterTabDescriptor[]) => {
    if (tabs.length === 0) return;

    pendingCloseQueueRef.current = [];
    const confirmQueue: PendingCenterTabClose[] = [];
    /** Closed immediately (no confirm) — used for a single MRU activation at the end. */
    const closedImmediately: string[] = [];

    let tmuxWindows: Awaited<ReturnType<typeof systemApi.listTmuxWindows>>["windows"] | null = null;
    const needsTmux = tabs.some((tab) => tab.kind === "terminal");
    if (needsTmux && effectiveContextId) {
      try {
        const response = await systemApi.listTmuxWindows(effectiveContextId);
        tmuxWindows = response.windows;
      } catch (error) {
        console.warn("Failed to inspect terminal foreground commands before bulk close", error);
      }
    }

    for (const tab of tabs) {
      if (isFileLikeCenterTabKind(tab.kind) && tab.file) {
        if (tab.file.isDirty) {
          confirmQueue.push({ kind: "file", file: tab.file });
        } else {
          closeFile(tab.file.path, effectiveContextId || undefined);
          closedImmediately.push(tab.file.path);
        }
        continue;
      }

      if (tab.kind === "terminal") {
        if (!effectiveContextId) continue;
        const tabPanes = getTerminalTabPanes(effectiveContextId, tab.value);
        if (hasNonIdleTerminalPanes(tabPanes, tmuxWindows)) {
          const payload = buildTerminalCloseConfirmPayload(
            effectiveContextId,
            tab.value,
            tabPanes,
            tmuxWindows,
          );
          confirmQueue.push({
            kind: "terminal",
            ...payload,
          });
        } else {
          performCloseTerminalCenterTab(tab.value, { skipActivation: true });
          closedImmediately.push(tab.value);
        }
        continue;
      }

      if (tab.kind === "project-wiki") {
        confirmQueue.push({ kind: "project-wiki" });
        continue;
      }

      if (tab.kind === "code-review") {
        confirmQueue.push({ kind: "code-review" });
        continue;
      }

      if (
        tab.kind === "github-pr" ||
        tab.kind === "github-issue" ||
        tab.kind === "github-action" ||
        tab.kind === "github-commit"
      ) {
        if (effectiveContextId) {
          closeGithubTab(effectiveContextId, tab.value);
          closedImmediately.push(tab.value);
        }
        continue;
      }

      if (tab.kind === "browser") {
        if (effectiveContextId) {
          closeBrowserCenterTab(effectiveContextId, tab.value);
          closedImmediately.push(tab.value);
        }
        continue;
      }

      if (tab.kind === "simulator") {
        if (effectiveContextId) {
          closeSimulatorTab(effectiveContextId);
          void simulatorApi.stop(effectiveContextId).catch(() => {});
          closedImmediately.push(SIMULATOR_TAB_VALUE);
        }
        continue;
      }

      if (tab.kind === "git-history") {
        if (effectiveContextId) {
          closeGitHistoryTab(effectiveContextId);
          closedImmediately.push(GIT_HISTORY_TAB_VALUE);
        }
        continue;
      }

      if (isCenterToolTabValue(tab.kind)) {
        if (effectiveContextId) {
          closeToolTab(effectiveContextId, tab.kind);
          closedImmediately.push(tab.kind);
        }
        continue;
      }
    }

    if (closedImmediately.length > 0) {
      activateNextAfterClosing(closedImmediately);
    }

    pendingCloseQueueRef.current = confirmQueue;
    advancePendingCloseQueue();
  }, [
    activateNextAfterClosing,
    advancePendingCloseQueue,
    buildTerminalCloseConfirmPayload,
    closeBrowserCenterTab,
    closeFile,
    closeGithubTab,
    closeSimulatorTab,
    closeGitHistoryTab,
    closeToolTab,
    effectiveContextId,
    getTerminalTabPanes,
    performCloseTerminalCenterTab,
  ]);


  const handleCloseCenterTabFromMenu = React.useCallback((tab: CenterTabDescriptor) => {
    void closeTabsSafely([tab]);
  }, [closeTabsSafely]);

  const handleTerminalPaneClosed = React.useCallback((event: {
    paneId: string;
    pane: TerminalPaneProps;
    terminalTabId: string;
    isLastPane: boolean;
  }) => {
    if (!effectiveContextId) return;

    if (event.isLastPane) {
      // Pane close already confirmed busy state for the last remaining pane.
      void handleCloseTerminalCenterTab(event.terminalTabId, { force: true });
      return;
    }

    const terminalState = useTerminalStore.getState();
    const isProjectContext =
      terminalState.workspaceContexts[effectiveContextId] ?? currentView === "project";
    const contextScope = isProjectContext ? "project" : "workspace";
    const tmuxWindowName = event.pane.tmuxWindowName;
    const pinKeys = tmuxWindowName
      ? [buildCanvasTerminalPinKey(contextScope, effectiveContextId, tmuxWindowName)]
      : [];

    void cleanupCanvasTerminalsForClosedTerminal({
      contextScope,
      pinKeys,
      tmuxWindowNames: tmuxWindowName ? [tmuxWindowName] : [],
      workspaceId: effectiveContextId,
    });
    removeTerminal(effectiveContextId, event.paneId, event.terminalTabId);
  }, [
    cleanupCanvasTerminalsForClosedTerminal,
    currentView,
    effectiveContextId,
    handleCloseTerminalCenterTab,
    removeTerminal,
  ]);

  const handleCanvasTerminalCloseRequest = React.useCallback(async (detail: CanvasTerminalCloseRequestDetail) => {
    if (!detail.workspaceId || !detail.tmuxWindowName) {
      return;
    }

    const terminalState = useTerminalStore.getState();
    const hit = findWorkspacePaneIdsByTmuxWindowName(
      terminalState,
      detail.workspaceId,
      detail.tmuxWindowName,
      detail.contextScope === "project",
    );
    const terminalTabId = hit?.terminalTabId || detail.sourceTerminalTabId || FIXED_TERMINAL_TAB_VALUE;
    const panes = terminalState.getPanes(detail.workspaceId, terminalTabId);
    const paneId = hit?.paneId ?? Object.entries(panes).find(([, pane]) =>
      pane.tmuxWindowName === detail.tmuxWindowName ||
      pane.label === detail.tmuxWindowName
    )?.[0];

    if (!paneId) {
      try {
        await systemApi.killTmuxWindow(detail.workspaceId, detail.tmuxWindowName);
      } catch (error) {
        console.warn("Failed to kill tmux window from Canvas close", error);
        toastManager.add({
          title: t("errors.failedToCloseTerminal"),
          description: error instanceof Error ? error.message : t("errors.unknown"),
          type: "error",
        });
      }
      return;
    }

    if (detail.workspaceId === effectiveContextId) {
      const grid = getTerminalGridForTab(terminalTabId);
      if (grid?.removeTerminalByTmuxWindowName(detail.tmuxWindowName)) {
        return;
      }
    }

    try {
      await systemApi.killTmuxWindow(detail.workspaceId, detail.tmuxWindowName);
    } catch (error) {
      console.warn("Failed to kill tmux window from Canvas close", error);
      toastManager.add({
        title: t("errors.failedToCloseTerminal"),
        description: error instanceof Error ? error.message : t("errors.unknown"),
        type: "error",
      });
    }

    if (Object.keys(panes).length <= 1) {
      if (detail.workspaceId === effectiveContextId) {
        // Pane already closed from canvas; force tab teardown without a second confirm.
        void handleCloseTerminalCenterTab(terminalTabId, { force: true });
      } else {
        terminalState.closeTerminalTab(detail.workspaceId, terminalTabId);
      }
      return;
    }

    terminalState.removeTerminal(detail.workspaceId, paneId, terminalTabId);
  }, [effectiveContextId, getTerminalGridForTab, handleCloseTerminalCenterTab, t]);

  React.useEffect(() => {
    const onCanvasTerminalCloseRequest = (event: Event) => {
      const detail = (event as CustomEvent<CanvasTerminalCloseRequestDetail>).detail;
      void handleCanvasTerminalCloseRequest(detail);
    };

    window.addEventListener(CANVAS_TERMINAL_CLOSE_REQUEST_EVENT, onCanvasTerminalCloseRequest);
    return () => {
      window.removeEventListener(CANVAS_TERMINAL_CLOSE_REQUEST_EVENT, onCanvasTerminalCloseRequest);
    };
  }, [handleCanvasTerminalCloseRequest]);

  const handleCenterStageTabChange = React.useCallback((val: string) => {
    if (val === "wiki" && experimentPrefsLoaded && !centerWikiTabEnabled) {
      setUrlParams({ tab: FIXED_TERMINAL_TAB_VALUE, wikiPage: null });
      setActiveFile(null, effectiveContextId || undefined);
      if (effectiveContextId) {
        useCenterPaneLayoutStore.getState().openTab(effectiveContextId, FIXED_TERMINAL_TAB_VALUE);
      }
      return;
    }
    if (isTerminalCenterTabValue(val)) {
      if (effectiveContextId) {
        setActiveTerminalTab(effectiveContextId, val);
      }
      setUrlParams({ tab: val, wikiPage: null });
      setActiveFile(null, effectiveContextId || undefined);
      // Defer focus until after React paints the active panel and surfaceActive
      // re-attaches. Immediate focus races keepalive→active layout and can
      // SIGWINCH Grok mid-hop (full-frame flash). Double rAF matches Terminal's
      // reveal settle window.
      const focusTerminalPane = () => {
        if (val === FIXED_TERMINAL_TAB_VALUE) {
          terminalGridRef.current?.focusActivePane();
        } else {
          runWhenTerminalGridReady(val, (grid) => grid.focusActivePane());
        }
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(focusTerminalPane);
      });
    } else if (isGithubCenterTabValue(val)) {
      setUrlParams({ tab: val, wikiPage: null });
      setActiveFile(null, effectiveContextId || undefined);
    } else if (isBrowserCenterTabValue(val)) {
      setUrlParams({ tab: val, wikiPage: null });
      setActiveFile(null, effectiveContextId || undefined);
    } else if (FIXED_TABS.has(val)) {
      setFixedTab(val as FixedTab);
      setActiveFile(null, effectiveContextId || undefined);
    } else {
      setActiveFile(val, effectiveContextId || undefined);
      // Clear tab param when opening a file
      setUrlParams({ tab: null, wikiPage: null });
    }
    // Multi-pane isolation: URL is only chrome focus. Ownership of the surface
    // always follows the focused pane (exclusive; removed from siblings).
    if (effectiveContextId && val) {
      useCenterPaneLayoutStore.getState().openTab(effectiveContextId, val);
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
  navigateCenterTabRef.current = handleCenterStageTabChange;

  useCenterStageKeyboardShortcuts({
    effectiveContextId,
    handleCenterStageTabChange,
    visibleTerminalTabs,
  });

  const {
    handleTabGroupDragEnd,
    orderedGroupedTabItems,
  } = useCenterStageTabGroups({
    browserTabs,
    codeReviewTabVisible,
    effectiveContextId,
    gitHistoryTabVisible,
    changesTabVisible,
    reviewTabVisible,
    runTabVisible,
    githubHubTabVisible,
    filesTabVisible,
    ptDesignTabVisible,
    githubTabs,
    openFiles,
    previewBrowserPrefs,
    projectWikiTabVisible,
    terminalTabs: visibleTerminalTabs,
  });

  const currentRepoPath = centerStageRepoPath;
  const sessionDisplay = useReviewSnapshotStore((s) => s.sessionDisplay);
  const handleGithubPullRequestChanged = React.useCallback(() => {
    if (currentRepoPath) {
      void invalidateGitQueries(currentRepoPath);
    }
  }, [currentRepoPath]);

  const handleCloseTabGroupItem = React.useCallback((tab: TabGroupItem) => {
    if (tab.kind === "terminal") {
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

    if (tab.kind === "github-pr" || tab.kind === "github-issue" || tab.kind === "github-action") {
      handleCloseGithubTab(tab.value);
      return;
    }

    if (tab.kind === "simulator") {
      handleCloseSimulatorTab();
      return;
    }

    if (tab.kind === "git-history") {
      handleCloseGitHistoryTab();
      return;
    }

    if (isCenterToolTabValue(tab.kind)) {
      handleCloseToolTab(tab.kind);
      return;
    }

    if (tab.kind === "browser") {
      if (tab.browserContextId && tab.browserTabId) {
        const context = previewBrowserPrefs.byContext[tab.browserContextId];
        const tabCount = context?.tabs?.length ?? 0;
        if (tabCount <= 1) {
          handleCloseBrowserTab(tab.value);
          return;
        }
        closeBrowserInternalTab(tab.browserContextId, tab.browserTabId);
        return;
      }
      handleCloseBrowserTab(tab.value);
      return;
    }

    if (tab.file) {
      handleCloseFile(tab.file);
    }
  }, [
    closeBrowserInternalTab,
    handleCloseBrowserTab,
    handleCloseFile,
    handleCloseGithubTab,
    handleCloseSimulatorTab,
    handleCloseGitHistoryTab,
    handleCloseToolTab,
    handleCloseTerminalCenterTab,
    previewBrowserPrefs,
  ]);

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
        activateNextAfterClosing("project-wiki");
      } catch (err) {
        toastManager.add({
          title: t("errors.failedToCloseTerminal"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
          type: "error",
        });
      }
    }
    advancingCloseQueueRef.current = true;
    setProjectWikiCloseConfirmOpen(false);
    advancePendingCloseQueue();
    queueMicrotask(() => {
      advancingCloseQueueRef.current = false;
    });
  };

  const handleConfirmCloseCodeReviewTerminal = async () => {
    if (effectiveContextId) {
      try {
        await systemApi.killCodeReviewWindow(effectiveContextId);
        codeReviewTerminalGridRef.current?.removeTerminalByTmuxWindowName(CODE_REVIEW_WINDOW_NAME);
        setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: false }));
        activateNextAfterClosing("code-review");
      } catch (err) {
        toastManager.add({
          title: t("errors.failedToCloseTerminal"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
          type: "error",
        });
      }
    }
    advancingCloseQueueRef.current = true;
    setCodeReviewCloseConfirmOpen(false);
    advancePendingCloseQueue();
    queueMicrotask(() => {
      advancingCloseQueueRef.current = false;
    });
  };

  // Paint / render context ids (may be empty before a workspace is selected).
  const paintContextId: string | null = liveEffectiveContextId;
  const renderContextId: string = effectiveContextId ?? liveEffectiveContextId ?? "";

  // --- Multi-pane center layout (dnd-kit grid) — hooks before any early return ---
  const hydratePaneLayout = useCenterPaneLayoutStore((s) => s.hydrate);
  const ensurePaneLayout = useCenterPaneLayoutStore((s) => s.ensureLayout);
  const paneLayout = useCenterPaneLayoutStore((s) =>
    renderContextId ? (s.byContext[renderContextId] ?? null) : null,
  );
  const focusCenterPane = useCenterPaneLayoutStore((s) => s.focus);
  const splitCenterPane = useCenterPaneLayoutStore((s) => s.split);
  const setCenterPaneTree = useCenterPaneLayoutStore((s) => s.setTree);
  const closeCenterPane = useCenterPaneLayoutStore((s) => s.close);
  const setPaneActiveTab = useCenterPaneLayoutStore((s) => s.setActiveTab);
  const setCenterPaneLayout = useCenterPaneLayoutStore((s) => s.setLayout);
  const hydrateSavedLayouts = useCenterPaneSavedLayoutStore((s) => s.hydrate);
  const syncSavedLayoutsFromDisk = useCenterPaneSavedLayoutStore(
    (s) => s.syncFromDisk,
  );
  const savedLayouts = useCenterPaneSavedLayoutStore((s) => s.layouts);
  const saveCenterLayout = useCenterPaneSavedLayoutStore((s) => s.save);
  const panelHostRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    hydratePaneLayout();
    // Instant localStorage cache, then fill/migrate from ~/.atmos when empty.
    hydrateSavedLayouts();
    void syncSavedLayoutsFromDisk();
  }, [hydratePaneLayout, hydrateSavedLayouts, syncSavedLayoutsFromDisk]);

  // Content-stable key so array identity churn from open-file lists cannot loop effects.
  const openTabIdKey = React.useMemo(() => {
    const ids = Array.from(collectOpenCenterTabValues());
    ids.sort();
    return ids.join("\0");
  }, [collectOpenCenterTabValues]);

  const openTabIdList = React.useMemo(
    () => (openTabIdKey ? openTabIdKey.split("\0") : []),
    [openTabIdKey],
  );

  const resolvedPaneLayout = React.useMemo(
    () => paneLayout ?? createDefaultLayout(openTabIdList, activeValue),
    [activeValue, openTabIdList, paneLayout],
  );

  React.useEffect(() => {
    if (!renderContextId) return;
    // Reconcile open-tab membership only. Do NOT auto-openTab from URL here —
    // that steals surfaces between multi-panes whenever `?tab=` changes.
    // Explicit navigation (tab click / create / hotkey) calls openTab itself.
    ensurePaneLayout(renderContextId, openTabIdList, activeValue);
  }, [
    activeValue,
    ensurePaneLayout,
    openTabIdKey,
    openTabIdList,
    renderContextId,
  ]);
  const isMultiPane = resolvedPaneLayout.order.length > 1;
  const paneSlotBoxes = useCenterPaneSlotBoxes(
    panelHostRef,
    resolvedPaneLayout,
    isMultiPane,
  );
  const multiActiveTabIds = React.useMemo(() => {
    if (!isMultiPane) return null;
    // Always pass a list when multi-pane so content slots position correctly
    // even if only one pane has an active tab (others empty).
    return collectActiveTabIds(resolvedPaneLayout);
  }, [isMultiPane, resolvedPaneLayout]);
  const tabToPaneId = React.useMemo(() => {
    if (!isMultiPane) return null;
    const map: Record<string, string> = {};
    for (const pane of resolvedPaneLayout.panes) {
      for (const tabId of pane.tabIds) {
        map[tabId] = pane.id;
      }
      map[pane.activeTabId] = pane.id;
    }
    return map;
  }, [isMultiPane, resolvedPaneLayout.panes]);

  const handleSplitRight = React.useCallback(() => {
    if (!renderContextId) return;
    if (resolvedPaneLayout.panes.length >= MAX_CENTER_PANES) return;
    // Empty pane — no tab steal; launcher empty state.
    splitCenterPane(renderContextId, "right");
  }, [resolvedPaneLayout.panes.length, renderContextId, splitCenterPane]);

  const handleSplitDown = React.useCallback(() => {
    if (!renderContextId) return;
    if (resolvedPaneLayout.panes.length >= MAX_CENTER_PANES) return;
    splitCenterPane(renderContextId, "down");
  }, [resolvedPaneLayout.panes.length, renderContextId, splitCenterPane]);

  const handlePaneTabChange = React.useCallback(
    (paneId: string, tabValue: string) => {
      if (!renderContextId) return;
      // Overview always activates on the primary pane.
      const targetPaneId =
        tabValue === OVERVIEW_TAB_ID
          ? (resolvedPaneLayout.panes.find((p) =>
              isPrimaryPane(resolvedPaneLayout, p.id),
            )?.id ?? paneId)
          : paneId;
      // Focus first so exclusive openTab lands on this pane (not a sibling).
      focusCenterPane(renderContextId, targetPaneId);
      // Exclusive ownership + URL chrome. openTab removes tab from other panes.
      setPaneActiveTab(renderContextId, targetPaneId, tabValue);
      handleCenterStageTabChange(tabValue);
    },
    [
      focusCenterPane,
      handleCenterStageTabChange,
      renderContextId,
      resolvedPaneLayout,
      setPaneActiveTab,
    ],
  );

  const handleSaveCenterLayout = React.useCallback(
    (name: string) => {
      const snap = snapshotCenterLayout(resolvedPaneLayout, name);
      if (!snap) return;
      saveCenterLayout(snap);
    },
    [resolvedPaneLayout, saveCenterLayout],
  );

  const handleApplyCenterLayout = React.useCallback(
    (layoutId: string) => {
      if (!renderContextId) return;
      const saved = useCenterPaneSavedLayoutStore.getState().getById(layoutId);
      if (!saved) return;

      const surfaces = collectSavedSurfaces(saved);
      let browserTabValue: string | null = null;

      for (const surface of surfaces) {
        if (surface === "browser") {
          const existing = browserTabs[0]?.value ?? null;
          if (existing) {
            browserTabValue = existing;
          } else {
            const tab = openBrowserCenterTab(renderContextId);
            browserTabValue = tab.value;
            requestBrowserContextUrlFocus(tab.browserContextId);
          }
          continue;
        }
        if (surface === "simulator") {
          openSimulatorTab(renderContextId);
          continue;
        }
        if (surface === "git-history") {
          openGitHistoryTab(renderContextId);
          continue;
        }
        if (isToolSurfaceKind(surface)) {
          openToolTab(renderContextId, surface);
          continue;
        }
        // overview / terminal / wiki / github: opened via URL tab selection below
      }

      const resolveTabId = (kind: CenterSurfaceKind) =>
        resolveSurfaceTabId(kind, { browserTabId: browserTabValue });

      const liveLayout = materializeSavedLayout(saved, resolveTabId);
      setCenterPaneLayout(renderContextId, liveLayout);

      const focused =
        liveLayout.panes.find((p) => p.id === liveLayout.focusedPaneId) ??
        liveLayout.panes[0];
      if (focused?.activeTabId) {
        setActiveFile(null, renderContextId);
        void setUrlParams({
          tab: focused.activeTabId,
          wikiPage: null,
        });
      }
    },
    [
      browserTabs,
      openBrowserCenterTab,
      openGitHistoryTab,
      openSimulatorTab,
      openToolTab,
      renderContextId,
      setActiveFile,
      setCenterPaneLayout,
      setUrlParams,
    ],
  );

  // Gate on live URL so deferred lag never flashes the empty/welcome chrome mid-hop.
  if (!liveEffectiveContextId || !paintContextId) {
    return (
      <CenterStageNoContextView
        currentView={currentView}
        automationsEnabled={automationsEnabled}
        ptDesignOpen={tabFromUrl === "pt-design"}
        onAddProject={() => setCreateProjectOpen(true)}
        onConnectAgent={() => {
          router.push('/agents');
        }}
      />
    );
  }

  const renderTabBar = (opts?: {
    paneId?: string;
    activeTabId?: string;
    allowedTabIds?: ReadonlySet<string>;
    onTabChange?: (v: string) => void;
  }) => {
    const allowed = opts?.allowedTabIds;
    const filterIds = <T,>(items: T[], idOf: (item: T) => string) =>
      allowed ? items.filter((item) => allowed.has(idOf(item))) : items;
    const has = (id: string) => !allowed || allowed.has(id);
    const changeTab = opts?.onTabChange ?? handleCenterStageTabChange;
    const runOnThisPane = (run: () => void) => {
      if (opts?.paneId && renderContextId) {
        focusCenterPane(renderContextId, opts.paneId);
      }
      run();
    };
    return (
      <CenterStageTabBar
        activeValue={opts?.activeTabId ?? activeValue}
        browserFallbackLabel={browserFallbackLabel}
        browserTabs={filterIds(browserTabs, (tab) => tab.value)}
        codeReviewTabVisible={codeReviewTabVisible && has("code-review")}
        effectiveContextId={renderContextId}
        githubTabs={filterIds(githubTabs, (tab) => tab.value)}
        openFiles={filterIds(openFiles, (file) => file.path)}
        orderedGroupedTabItems={filterGroupedTabItemsByAllowedIds(
          orderedGroupedTabItems,
          allowed,
        )}
        tabStripOrder={tabStripOrder}
        onTabStripOrderChange={handleTabStripOrderChange}
        previewBrowserPrefs={previewBrowserPrefs}
        projectWikiTabVisible={projectWikiTabVisible && has("project-wiki")}
        simulatorTabVisible={simulatorTabVisible && has(SIMULATOR_TAB_VALUE)}
        gitHistoryTabVisible={gitHistoryTabVisible && has(GIT_HISTORY_TAB_VALUE)}
        changesTabVisible={changesTabVisible && has("changes")}
        reviewTabVisible={reviewTabVisible && has("review")}
        runTabVisible={runTabVisible && has("run")}
        githubHubTabVisible={githubHubTabVisible && has("github")}
        filesTabVisible={filesTabVisible && has("files")}
        ptDesignTabVisible={ptDesignTabVisible && has("pt-design")}
        scrollableTabsRef={scrollableTabsRef}
        sessionDisplay={sessionDisplay}
        tabGroupDndSensors={tabGroupDndSensors}
        visibleTerminalTabs={filterIds(visibleTerminalTabs, (tab) => tab.id)}
        wikiCenterEligible={wikiCenterEligible && has("wiki")}
        wikiRefreshing={wikiRefreshing}
        overviewVisible={has(OVERVIEW_TAB_ID)}
        handleCenterStageTabChange={changeTab}
        handleCloseTabGroupItem={handleCloseTabGroupItem}
        handleCloseBrowserTab={handleCloseBrowserTab}
        handleCloseFile={handleCloseFile}
        handleCloseGithubTab={handleCloseGithubTab}
        handleCloseTerminalCenterTab={handleCloseTerminalCenterTab}
        handleCreateBrowserCenterTab={() =>
          runOnThisPane(handleCreateBrowserCenterTab)
        }
        handleCreateSimulatorCenterTab={() =>
          runOnThisPane(handleCreateSimulatorCenterTab)
        }
        handleCreateTerminalCenterTab={() =>
          runOnThisPane(handleCreateTerminalCenterTab)
        }
        handleCreateToolCenterTab={(tab) =>
          runOnThisPane(() => handleCreateToolCenterTab(tab))
        }
        handleCloseSimulatorTab={handleCloseSimulatorTab}
        handleCloseGitHistoryTab={handleCloseGitHistoryTab}
        handleCloseToolTab={handleCloseToolTab}
        handleRenameTerminalCenterTab={handleRenameTerminalCenterTab}
        handleSelectTabGroupItem={(tab) => {
          if (tab.kind === "browser" && tab.browserContextId && tab.browserTabId) {
            selectBrowserInternalTab(tab.browserContextId, tab.browserTabId);
          }
          changeTab(tab.value);
        }}
        handleTabGroupDragEnd={handleTabGroupDragEnd}
        pinFile={pinFile}
        setCodeReviewCloseConfirmOpen={setCodeReviewCloseConfirmOpen}
        setProjectWikiCloseConfirmOpen={setProjectWikiCloseConfirmOpen}
        setTabContextMenu={setTabContextMenu}
        setWikiRefreshing={setWikiRefreshing}
        setWikiRefreshTrigger={setWikiRefreshTrigger}
        onSplitRight={handleSplitRight}
        onSplitDown={handleSplitDown}
        savedLayouts={savedLayouts.map((layout) => ({
          id: layout.id,
          name: layout.name,
        }))}
        onSaveLayout={handleSaveCenterLayout}
        onApplyLayout={handleApplyCenterLayout}
      />
    );
  };

  const panels = (
    <CenterStagePanels
      activeValue={activeValue}
      activeTabIds={multiActiveTabIds}
      tabToPaneId={tabToPaneId}
      paneSlotBoxes={isMultiPane ? paneSlotBoxes : null}
      browserTabs={browserTabs}
      codeReviewTabVisible={codeReviewTabVisible}
      codeReviewTerminalGridRef={codeReviewTerminalGridRef}
      currentBranch={currentBranch}
      currentProject={currentProject}
      currentRepoPath={currentRepoPath}
      currentView={currentView}
      currentWorkspace={currentWorkspace}
      // Deferred: URL-synced live props rebind only after hop settles.
      effectiveContextId={renderContextId}
      // Live: shell paint identity tracks the route immediately (DOM may lead).
      paintContextId={paintContextId}
      githubTabs={githubTabs}
      handleCloseGithubTab={handleCloseGithubTab}
      handleCreateTerminalCenterTab={handleCreateTerminalCenterTab}
      handleTerminalPaneClosed={handleTerminalPaneClosed}
      mountedTerminalTabsByContext={mountedTerminalTabsByContext}
      openFiles={openFiles}
      onGithubPullRequestChanged={handleGithubPullRequestChanged}
      projectWikiTabVisible={projectWikiTabVisible}
      simulatorTabVisible={simulatorTabVisible}
      gitHistoryTabVisible={gitHistoryTabVisible}
      changesTabVisible={changesTabVisible}
      reviewTabVisible={reviewTabVisible}
      runTabVisible={runTabVisible}
      githubHubTabVisible={githubHubTabVisible}
      filesTabVisible={filesTabVisible}
      ptDesignTabVisible={ptDesignTabVisible}
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
  );

  // Show setup progress if active workspace is being initialized
  if (currentSetupProgress && isSetupBlocking) {
    return (
      <CenterStageSurface>
        <WorkspaceSetupProgressView
          progress={currentSetupProgress}
          onFinish={handleFinishSetup}
        />
      </CenterStageSurface>
    );
  }

  return (
    // Inset + rounded cards so all four corners read as a floating main stage.
    // Padding gutters use shell `bg-sidebar` so `bg-background` center pops.
    <main className={cn(CENTER_STAGE_SHELL_CLASS, CENTER_STAGE_GUTTER_CLASS)}>
      {isMultiPane ? (
        <div data-center-stage-card="" className="relative min-h-0 flex-1">
          <div className="absolute inset-0 min-h-0">
            <CenterPaneGrid
              layout={resolvedPaneLayout}
              onTreeChange={(tree) => {
                if (renderContextId) setCenterPaneTree(renderContextId, tree);
              }}
              onFocus={(paneId) => {
                if (!renderContextId) return;
                focusCenterPane(renderContextId, paneId);
                const pane = resolvedPaneLayout.panes.find((p) => p.id === paneId);
                // Empty launchers have no surface — don't rewrite the URL/active
                // tab of the other pane when focusing them.
                if (pane && pane.activeTabId && !isEmptyPane(pane)) {
                  handleCenterStageTabChange(pane.activeTabId);
                }
              }}
              renderPaneChrome={(pane) => {
                const primary = isPrimaryPane(resolvedPaneLayout, pane.id);
                const empty = isEmptyPane(pane);
                const allowed = new Set(
                  pane.tabIds.filter(
                    (id) => primary || id !== OVERVIEW_TAB_ID,
                  ),
                );
                // Overview never appears in secondary pane tab strips.
                if (!primary) allowed.delete(OVERVIEW_TAB_ID);
                const activeTabId =
                  empty
                    ? ""
                    : !primary && pane.activeTabId === OVERVIEW_TAB_ID
                      ? (pane.tabIds.find((id) => id !== OVERVIEW_TAB_ID) ??
                        pane.activeTabId)
                      : pane.activeTabId;

                const openInThisPane = (run: () => void) => {
                  if (renderContextId) {
                    focusCenterPane(renderContextId, pane.id);
                  }
                  run();
                };

                const emptyActions = buildDefaultEmptyPaneActions({
                  labels: {
                    terminal: tabBarT("newTerminalTab"),
                    files: tabBarT("newFiles"),
                    changes: tabBarT("newChanges"),
                    review: tabBarT("newReview"),
                    run: tabBarT("newRun"),
                    github: tabBarT("newGithub"),
                    simulator: tabBarT("newSimulator"),
                  },
                  modKey:
                    typeof navigator !== "undefined" &&
                    /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
                      ? "⌘"
                      : "Ctrl",
                  includeOverview: primary,
                  overviewLabel: tabBarT("overview"),
                  onCreateTerminal: () =>
                    openInThisPane(handleCreateTerminalCenterTab),
                  onCreateToolTab: (tab) =>
                    openInThisPane(() => handleCreateToolCenterTab(tab)),
                  onCreateSimulator: () =>
                    openInThisPane(handleCreateSimulatorCenterTab),
                  onOpenOverview: () =>
                    openInThisPane(() => handleCenterStageTabChange("overview")),
                });

                if (empty) {
                  return (
                    <div className="flex h-full min-h-0 flex-col overflow-hidden">
                      <div className="shrink-0">
                        {renderTabBar({
                          // Empty secondary launcher: no active tab (do not mirror
                          // the other pane's URL active / Overview selection).
                          paneId: pane.id,
                          activeTabId: "",
                          allowedTabIds: allowed,
                          onTabChange: (value) =>
                            handlePaneTabChange(pane.id, value),
                        })}
                      </div>
                      <CenterPaneEmptyState
                        actions={emptyActions}
                        onClose={
                          primary || !renderContextId
                            ? undefined
                            : () => closeCenterPane(renderContextId, pane.id)
                        }
                      />
                    </div>
                  );
                }

                return (
                  <Tabs
                    value={activeTabId}
                    onValueChange={(value) => handlePaneTabChange(pane.id, value)}
                    className="flex h-full min-h-0 flex-col gap-0 overflow-hidden"
                  >
                    {renderTabBar({
                      paneId: pane.id,
                      activeTabId,
                      allowedTabIds: allowed,
                      onTabChange: (value) => handlePaneTabChange(pane.id, value),
                    })}
                    <CenterPaneContentSlot paneId={pane.id} />
                  </Tabs>
                );
              }}
            />
          </div>
          <div
            ref={panelHostRef}
            className="pointer-events-none absolute inset-0 min-h-0"
          >
            {panels}
          </div>
        </div>
      ) : (
        <Tabs
          value={activeValue}
          onValueChange={handleCenterStageTabChange}
          // isolate helps clip xterm WebGL to the rounded card corners.
          data-center-stage-card=""
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-0 isolate",
            CENTER_STAGE_CARD_CLASS,
          )}
        >
          {renderTabBar()}
          {panels}
        </Tabs>
      )}

      <CenterStageTabContextMenu
        tabContextMenu={tabContextMenu}
        setTabContextMenu={setTabContextMenu}
        basePath={currentWorkspace?.localPath || currentProject?.mainFilePath}
        onCloseTab={handleCloseCenterTabFromMenu}
        onCloseTabs={(tabs) => {
          void closeTabsSafely(tabs);
        }}
        onRenameTerminalTab={handleRenameTerminalCenterTab}
      />

      <TerminalCloseConfirmDialog
        open={projectWikiCloseConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissCloseConfirmDialog();
        }}
        title={t("dialogs.closeProjectWikiTerminal.title")}
        description={t("dialogs.closeProjectWikiTerminal.description")}
        onConfirm={handleConfirmCloseProjectWikiTerminal}
      />

      <TerminalCloseConfirmDialog
        open={codeReviewCloseConfirmOpen}
        onOpenChange={(open) => {
          if (!open) dismissCloseConfirmDialog();
        }}
        title={t("dialogs.closeCodeReviewTerminal.title")}
        description={t("dialogs.closeCodeReviewTerminal.description")}
        onConfirm={handleConfirmCloseCodeReviewTerminal}
      />

      <TerminalCloseConfirmDialog
        open={!!terminalTabCloseConfirm}
        onOpenChange={(open) => {
          if (!open) dismissCloseConfirmDialog();
        }}
        title={t("dialogs.closeTerminalTab.title")}
        description={t("dialogs.closeTerminalTab.description", {
          title: terminalTabCloseConfirm?.title ?? t("fallbackTerminalTitle"),
        })}
        items={terminalTabCloseConfirm?.runningPaneNames}
        onConfirm={handleConfirmCloseTerminalCenterTab}
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
            setCodeReviewPendingCommand({ command });
            setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
            setFixedTab("code-review");
          }}
          onReplaceTerminalAndRun={async (command) => {
            if (!effectiveContextId) return;
            try {
              await systemApi.killCodeReviewWindow(effectiveContextId);
              codeReviewTerminalGridRef.current?.removeTerminalByTmuxWindowName(CODE_REVIEW_WINDOW_NAME);
              codeReviewUserTriggeredRef.current = true;
              setCodeReviewPendingCommand({ command });
              setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
              setFixedTab("code-review");
              toastManager.add({
                title: t("toasts.codeReviewStarted.title"),
                description: t("toasts.codeReviewStarted.description"),
                type: "info",
              });
            } catch (err) {
              setCodeReviewPendingCommand(null);
              toastManager.add({
                title: t("errors.failedToClosePreviousTerminal"),
                description: err instanceof Error ? err.message : t("errors.unknown"),
                type: "error",
              });
            }
          }}
        />
      )}

      <UnsavedChangesDialog
        fileToClose={fileToClose}
        onCancel={dismissCloseConfirmDialog}
        onConfirm={confirmClose}
      />

    </main>
  );
};

export default CenterStage;
