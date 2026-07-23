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
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import { useProjectStore } from "@/features/project/store/use-project-store";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import {
  clearLastPinnedTerminal,
  readCenterStageLastTab,
  setCenterStageLastTab,
} from "@/shared/stores/use-ui-pref-hooks";
import { WorkspaceSetupProgressView } from "@/features/workspace/components/WorkspaceSetupProgress";
import { isWorkspaceSetupBlocking } from "@/features/workspace/lib/workspace-setup";
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
import { CodeReviewDialog } from "@/features/code-review";
import { useReviewSnapshotStore } from "@/features/code-review/store/review-snapshot-store";
import { usePrewarmCodeLanguages } from "@/shared/hooks/use-prewarm-code-languages";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { buildInteractiveAgentRunPlan } from "@/features/agent/lib/terminal-agent-run-config";
import { resolveAgentFixLaunchPrompt } from "@/features/agent-fix/lib/agent-fix-prompt-file";
import { useWorkspaceCreationStore } from "@/features/workspace/store/workspace-creation-store";
import { useExperimentSettingsStore } from "@/features/settings/store/experiment-settings-store";
import {
  FIXED_TABS,
  isTerminalCenterTabValue,
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
  type PendingNamedTerminalRun,
} from "@/app-shell/center-stage-support";
import { useCenterStageTabGroups } from "@/app-shell/use-center-stage-tab-groups";
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
} from "@/features/run-preview/store/use-browser-center-tabs";
import { useBrowserTabCommandsStore } from "@/features/run-preview/store/use-browser-tab-commands";
import {
  DEFAULT_PREVIEW_BROWSER_PREFS,
  type PreviewBrowserPrefs,
} from "@/features/run-preview/lib/preview-browser-labels";
import { useConnectionStore } from "@/features/connection/store/connection-store";
import { useUiPrefStore } from "@/shared/stores/use-ui-pref-store";

const EMPTY_GITHUB_TABS: GithubCenterTab[] = [];
const EMPTY_BROWSER_TABS: BrowserCenterTab[] = [];

const CenterStage: React.FC = () => {
  const t = useTranslations("appShell.centerStage");
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
  const [tabContextMenu, setTabContextMenu] = React.useState<FileTabContextMenuState>(null);
  const [tabGroupPopoverOpen, setTabGroupPopoverOpen] = React.useState(false);
  const tabGroupDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [termTabPlusHoveredTabId, setTermTabPlusHoveredTabId] = React.useState<string | null>(null);

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

  const { workspaceId, projectId: projectIdFromUrl, effectiveContextId, currentView } = useContextParams();
  const githubTabs = useGithubCenterTabsStore((state) =>
    effectiveContextId
      ? state.tabsByContext[effectiveContextId] ?? EMPTY_GITHUB_TABS
      : EMPTY_GITHUB_TABS,
  );
  const openGithubPullRequest = useGithubCenterTabsStore(
    (state) => state.openPullRequest,
  );
  const openGithubActionRun = useGithubCenterTabsStore(
    (state) => state.openActionRun,
  );
  const closeGithubTab = useGithubCenterTabsStore((state) => state.closeTab);
  const browserTabs = useBrowserCenterTabsStore((state) =>
    effectiveContextId
      ? state.tabsByContext[effectiveContextId] ?? EMPTY_BROWSER_TABS
      : EMPTY_BROWSER_TABS,
  );
  const openBrowserCenterTab = useBrowserCenterTabsStore((state) => state.openBrowser);
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
  const statusQuery = useGitStatusQuery(centerStageRepoPath);
  const currentBranch = statusQuery.data?.current_branch ?? null;
  const githubOwner = statusQuery.data?.github_owner ?? null;
  const githubRepo = statusQuery.data?.github_repo ?? null;

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
        label: githubTabsT("pullRequest", { number: target.itemId }),
        owner: githubOwner,
        prNumber: target.itemId,
        repo: githubRepo,
      });
      return;
    }

    openGithubActionRun(effectiveContextId, {
      label: githubTabsT("actionRun", { number: target.itemId }),
      owner: githubOwner,
      repo: githubRepo,
      run: null,
      runId: target.itemId,
    });
  }, [
    currentBranch,
    effectiveContextId,
    githubOwner,
    githubRepo,
    githubTabs,
    githubTabsT,
    openGithubActionRun,
    openGithubPullRequest,
    tabFromUrl,
  ]);

  const handleCloseGithubTab = React.useCallback(
    (value: string) => {
      if (!effectiveContextId) return;
      const closingIndex = githubTabs.findIndex((tab) => tab.value === value);
      const nextTab =
        githubTabs[closingIndex + 1] ?? githubTabs[closingIndex - 1] ?? null;
      closeGithubTab(effectiveContextId, value);
      if (activeValue === value) {
        setUrlParams({
          tab: nextTab?.value ?? fallbackCenterTab,
          wikiPage: null,
        });
      }
    },
    [
      activeValue,
      closeGithubTab,
      effectiveContextId,
      fallbackCenterTab,
      githubTabs,
      setUrlParams,
    ],
  );

  const handleCloseBrowserTab = React.useCallback(
    (value: string) => {
      if (!effectiveContextId) return;
      const closingIndex = browserTabs.findIndex((tab) => tab.value === value);
      const nextTab =
        browserTabs[closingIndex + 1] ?? browserTabs[closingIndex - 1] ?? null;
      closeBrowserCenterTab(effectiveContextId, value);
      if (activeValue === value) {
        setUrlParams({
          tab: nextTab?.value ?? fallbackCenterTab,
          wikiPage: null,
        });
      }
    },
    [
      activeValue,
      browserTabs,
      closeBrowserCenterTab,
      effectiveContextId,
      fallbackCenterTab,
      setUrlParams,
    ],
  );

  const handleCreateBrowserCenterTab = React.useCallback(() => {
    if (!effectiveContextId) return;
    const tab = openBrowserCenterTab(effectiveContextId);
    setActiveFile(null, effectiveContextId);
    void setUrlParams({ tab: tab.value, wikiPage: null });
  }, [effectiveContextId, openBrowserCenterTab, setActiveFile, setUrlParams]);

  useTerminalTabMountLifecycle({
    activeValue,
    effectiveContextId,
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

  React.useEffect(() => {
    if (!effectiveContextId) return;
    primeWorkspace(effectiveContextId, currentView === "project");
  }, [currentView, effectiveContextId, primeWorkspace]);

  // Restore the last active center tab when switching workspace/project context,
  // then persist the settled selection. Must not persist the transient fallback tab
  // (first terminal / URL mismatch) before restore runs — that clobbers the saved tab.
  React.useEffect(() => {
    if (!effectiveContextId || !activeValue) return;

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
          if (visibleTerminalTabs.some((tab) => tab.id === last)) {
            restoringCenterTabToRef.current = last;
            setUrlParams({ tab: last, wikiPage: null });
            return;
          }
          // Terminal tabs may still be hydrating — keep pending until ready.
          if (!isTerminalWorkspaceReady) {
            return;
          }
          pendingCenterTabRestoreContextRef.current = null;
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
    runWhenTerminalGridReady(nextTab.id, (grid) => grid.focusActivePane());
  }, [effectiveContextId, createTerminalTab, runWhenTerminalGridReady, setActiveFile, setActiveTerminalTab, setUrlParams]);

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

  const handleCloseTerminalCenterTab = React.useCallback((tabId: string) => {
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

    if (activeValue === tabId) {
      const nextTabs = useTerminalStore.getState().getTerminalTabs(effectiveContextId);
      setUrlParams({ tab: nextTabs[0]?.id ?? "overview", wikiPage: null });
    }
  }, [
    activeValue,
    cleanupCanvasTerminalsForClosedTerminal,
    closeTerminalTab,
    currentView,
    effectiveContextId,
    getTerminalGridForTab,
    getTerminalTabPanes,
    removeMountedTerminalTab,
    setUrlParams,
  ]);

  const handleTerminalPaneClosed = React.useCallback((event: {
    paneId: string;
    pane: TerminalPaneProps;
    terminalTabId: string;
    isLastPane: boolean;
  }) => {
    if (!effectiveContextId) return;

    if (event.isLastPane) {
      handleCloseTerminalCenterTab(event.terminalTabId);
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
        handleCloseTerminalCenterTab(terminalTabId);
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
    browserTabs,
    codeReviewTabVisible,
    effectiveContextId,
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

  const handleSelectTabGroupItem = React.useCallback((tab: TabGroupItem) => {
    if (tab.kind === "browser" && tab.browserContextId && tab.browserTabId) {
      selectBrowserInternalTab(tab.browserContextId, tab.browserTabId);
    }
    handleCenterStageTabChange(tab.value);
    setTabGroupPopoverOpen(false);
  }, [handleCenterStageTabChange, selectBrowserInternalTab]);

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

    if (tab.kind === "github-pr" || tab.kind === "github-action") {
      handleCloseGithubTab(tab.value);
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
    handleCloseTerminalCenterTab,
    previewBrowserPrefs,
  ]);

  const isTabGroupItemActive = React.useCallback(
    (tab: TabGroupItem) => {
      if (tab.kind !== "browser") {
        return activeValue === tab.value;
      }
      if (activeValue !== tab.value || !tab.browserContextId || !tab.browserTabId) {
        return false;
      }
      const context = previewBrowserPrefs.byContext[tab.browserContextId];
      const activeTabId = context?.activeTabId ?? context?.tabs?.[0]?.id;
      return activeTabId === tab.browserTabId;
    },
    [activeValue, previewBrowserPrefs],
  );

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
          title: t("errors.failedToCloseTerminal"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
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
          title: t("errors.failedToCloseTerminal"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
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
        automationsEnabled={automationsEnabled}
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
          browserFallbackLabel={browserFallbackLabel}
          browserTabs={browserTabs}
          codeReviewTabVisible={codeReviewTabVisible}
          effectiveContextId={effectiveContextId}
          githubTabs={githubTabs}
          isTabGroupItemActive={isTabGroupItemActive}
          openFiles={openFiles}
          orderedGroupedTabItems={orderedGroupedTabItems}
          previewBrowserPrefs={previewBrowserPrefs}
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
          handleCloseBrowserTab={handleCloseBrowserTab}
          handleCloseFile={handleCloseFile}
          handleCloseGithubTab={handleCloseGithubTab}
          handleCloseTerminalCenterTab={handleCloseTerminalCenterTab}
          handleCreateBrowserCenterTab={handleCreateBrowserCenterTab}
          handleCreateTerminalCenterTab={handleCreateTerminalCenterTab}
          handleRenameTerminalCenterTab={handleRenameTerminalCenterTab}
          handleSelectTabGroupItem={handleSelectTabGroupItem}
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
          browserTabs={browserTabs}
          codeReviewTabVisible={codeReviewTabVisible}
          codeReviewTerminalGridRef={codeReviewTerminalGridRef}
          currentBranch={currentBranch}
          currentProject={currentProject}
          currentRepoPath={currentRepoPath}
          currentView={currentView}
          currentWorkspace={currentWorkspace}
          effectiveContextId={effectiveContextId}
          githubTabs={githubTabs}
          handleCloseGithubTab={handleCloseGithubTab}
          handleCreateTerminalCenterTab={handleCreateTerminalCenterTab}
          handleTerminalPaneClosed={handleTerminalPaneClosed}
          mountedTerminalTabsByContext={mountedTerminalTabsByContext}
          openFiles={openFiles}
          onGithubPullRequestChanged={handleGithubPullRequestChanged}
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
        title={t("dialogs.closeProjectWikiTerminal.title")}
        description={t("dialogs.closeProjectWikiTerminal.description")}
        onConfirm={handleConfirmCloseProjectWikiTerminal}
      />

      <TerminalCloseConfirmDialog
        open={codeReviewCloseConfirmOpen}
        onOpenChange={setCodeReviewCloseConfirmOpen}
        title={t("dialogs.closeCodeReviewTerminal.title")}
        description={t("dialogs.closeCodeReviewTerminal.description")}
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
        onCancel={() => setFileToClose(null)}
        onConfirm={confirmClose}
      />

    </main>
  );
};

export default CenterStage;
