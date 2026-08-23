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
  setCenterStageWikiPage,
  useCenterStageLastTab,
  useCenterStageWikiPage,
  writeCenterStageTabStripOrder,
} from "@/shared/stores/use-ui-pref-hooks";
import { WorkspaceSetupProgressView } from "@/features/workspace/components/WorkspaceSetupProgress";
import { isWorkspaceSetupBlocking } from "@/features/workspace/lib/workspace-setup";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
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
import {
  getScopeKey,
  spaceIdFromTmuxWindowName,
} from "@/features/terminal/store/terminal-store-helpers";
import { CodeReviewDialog } from "@/features/code-review";
import { useReviewSnapshotStore } from "@/features/code-review/store/review-snapshot-store";
import { usePrewarmCodeLanguages } from "@/shared/hooks/use-prewarm-code-languages";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { buildInteractiveAgentRunPlan } from "@/features/agent/lib/terminal-agent-run-config";
import { resolveDefaultSplitAgent } from "@/features/terminal/lib/terminal-split-prefs";
import { useTerminalSplitPrefsStore } from "@/features/settings/store/terminal-split-prefs-store";
import { resolveAgentFixLaunchPrompt } from "@/features/agent-fix/lib/agent-fix-prompt-file";
import { useWorkspaceCreationStore } from "@/features/workspace/store/workspace-creation-store";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import { useAgentTitleSettingsStore } from "@/features/settings/store/agent-title-settings-store";
import { useExperimentSettingsStore } from "@/features/settings/store/experiment-settings-store";
import {
  FIXED_TABS,
  isTerminalCenterTabValue,
  type TabGroupItem,
} from "@/app-shell/center-stage-tabs";

import { CenterStageTabBar } from "@/app-shell/CenterStageTabBar";
import {
  CenterStageTabContextMenu,
} from "@/app-shell/center-stage-tab-menu";
import type {
  CenterTabContextMenuState,
  CenterTabDescriptor,
} from "@/app-shell/center-stage-tab-model";
import {
  appendCenterTabToStripOrder,
  collectDefaultCenterStripTabIds,
  isFileLikeCenterTabKind,
} from "@/app-shell/center-stage-tab-model";
import {
  buildOpenCenterTabValues,
  getCenterTabActivationStack,
  recordCenterTabActivation,
  removeCenterTabFromActivationStack,
} from "@/app-shell/center-stage-tab-activation-stack";
import {
  TerminalCloseConfirmDialog,
  UnsavedChangesDialog,
} from "@/app-shell/center-stage-dialogs";

import { CENTER_STAGE_FULLSCREEN_Z_INDEX } from "@/app-shell/center-stage-fullscreen";
import {
  useCenterStageFullscreenMotion,
  useCenterStageFullscreenStore,
} from "@/app-shell/use-center-stage-fullscreen";
import { CenterStagePanels } from "@/app-shell/CenterStagePanels";
import {
  CenterPaneContentSlot,
  CenterPaneGrid,
} from "@/app-shell/center-pane/CenterPaneGrid";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import {
  applyLegacyStripOrder,
  buildTabToPaneId,
  collectActiveTabIds,
  createDefaultLayout,
  createEmptyCenterLayout,
  isEmptyPane,
  isFreshEmptyCenterLayout,
  isPrimaryPane,
  MAX_CENTER_PANES,
  OVERVIEW_TAB_ID,
  resolvePaneTabStripOrder,
} from "@/app-shell/center-pane/center-pane-layout";
import {
  collapsedStripOrderForContext,
  shouldHoldMosaicAfterCollapse,
  shouldSeedMosaicFromFullPane,
} from "@/app-shell/center-pane/center-pane-collapse-persist";
import { resolveStripOrderForContext } from "@/app-shell/center-pane/center-pane-strip-prefs";
import { resolvePaneLocalCloseFallback } from "@/app-shell/center-pane/center-pane-close-fallback";
import {
  paneIdFromOverlayEventTarget,
  shouldFocusOwningPane,
} from "@/app-shell/center-pane/center-pane-overlay-focus";
import { areOpenTabIdListSourcesHydrated } from "@/app-shell/center-pane/center-pane-open-tab-hydration";
import { useCenterPaneSlotBoxes } from "@/app-shell/center-pane/use-center-pane-slot-boxes";
import { CENTER_PANE_LAYOUT_MOTION_MS } from "@/app-shell/center-pane/center-pane-layout-motion";
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
  DEFAULT_CENTER_SPACE_ID,
  hostIdFromCenterKey,
  isExtraCenterSpaceKey,
  makeCenterSpaceKey,
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import {
  openNewCenterSpace,
  switchCenterSpace,
} from "@/app-shell/center-space/center-space-switch";
import {
  bindCenterPaintTabUrlWriter,
  shouldHonorUrlTabForPaintContext,
} from "@/app-shell/center-space/center-space-url";
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

type PendingCenterTabClose =
  | { kind: "file"; file: OpenFile }
  | { kind: "terminal"; tabId: string; title: string; runningPaneNames: string[] }
  | { kind: "project-wiki" }
  | { kind: "code-review" };

function useZustandPersistHydrated(persistApi: {
  hasHydrated: () => boolean;
  onFinishHydration: (cb: () => void) => () => void;
} | undefined): boolean {
  const [hydrated, setHydrated] = React.useState(() => persistApi?.hasHydrated() ?? true);
  React.useEffect(() => {
    if (!persistApi || persistApi.hasHydrated()) return;
    return persistApi.onFinishHydration(() => setHydrated(true));
  }, [persistApi]);
  return hydrated;
}

const EMPTY_GITHUB_TABS: GithubCenterTab[] = [];
const EMPTY_BROWSER_TABS: BrowserCenterTab[] = [];
const EMPTY_TERMINAL_TABS: Array<{
  id: string;
  title: string;
  closable: boolean;
  customTitle?: string;
}> = [];

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
  const projectWikiTerminalGridRef = React.useRef<TerminalGridHandle>(null);
  const [projectWikiPendingCommand, setProjectWikiPendingCommand] =
    React.useState<PendingNamedTerminalRun | null>(null);
  const [projectWikiCloseConfirmOpen, setProjectWikiCloseConfirmOpen] = React.useState(false);
  const [wikiRefreshTrigger, setWikiRefreshTrigger] = React.useState(0);
  const [wikiRefreshing, setWikiRefreshing] = React.useState(false);
  const [tabContextMenu, setTabContextMenu] = React.useState<CenterTabContextMenuState>(null);
  const [tabStripState, setTabStripState] = React.useState<{
    contextId: string | null;
    order: string[];
  }>({ contextId: null, order: [] });
  const contextStripOrderRef = React.useRef<readonly string[]>([]);
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
  const githubTabsHydrated = useZustandPersistHydrated(useGithubCenterTabsStore.persist);
  const browserTabsHydrated = useZustandPersistHydrated(useBrowserCenterTabsStore.persist);
  const paneLayoutHydrated = useCenterPaneLayoutStore((s) => s.hydrated);
  const openTabSourcesHydrated = areOpenTabIdListSourcesHydrated({
    editorHydrated: isEditorHydrated,
    githubHydrated: githubTabsHydrated,
    browserHydrated: browserTabsHydrated,
    layoutHydrated: paneLayoutHydrated,
  });

  const {
    workspaceId: liveWorkspaceId,
    projectId: liveProjectIdFromUrl,
    effectiveContextId: liveHostContextId,
    currentView,
  } = useContextParams();
  const hydrateCenterSpaces = useCenterSpaceStore((s) => s.hydrate);
  const syncCenterSpacesFromDisk = useCenterSpaceStore((s) => s.syncFromDisk);
  React.useEffect(() => {
    hydrateCenterSpaces();
    void syncCenterSpacesFromDisk();
  }, [hydrateCenterSpaces, syncCenterSpacesFromDisk]);
  const liveActiveSpaceId = useCenterSpaceStore((s) =>
    liveHostContextId
      ? s.getActiveSpaceId(liveHostContextId)
      : DEFAULT_CENTER_SPACE_ID,
  );
  const liveCenterContextId = liveHostContextId
    ? makeCenterSpaceKey(liveHostContextId, liveActiveSpaceId)
    : null;
  const isExtraCenterSpace = Boolean(
    liveHostContextId && liveCenterContextId && liveCenterContextId !== liveHostContextId,
  );
  const liveExtraSpaceEmpty = useCenterPaneLayoutStore((s) => {
    if (!liveCenterContextId || !isExtraCenterSpaceKey(liveCenterContextId)) {
      return false;
    }
    const layout = s.byContext[liveCenterContextId];
    return !layout || isFreshEmptyCenterLayout(layout);
  });
  // IMP-013: heavy tab/file/terminal rebind follows deferred IDs.
  // Live IDs stay for promote + paint so the left sidebar's urgent
  // URL update is not stuck behind a multi-frame center commit.
  const workspaceId = React.useDeferredValue(liveWorkspaceId);
  const projectIdFromUrl = React.useDeferredValue(liveProjectIdFromUrl);
  const effectiveContextId = React.useDeferredValue(liveCenterContextId);
  const isCenterContextSettled =
    workspaceId === liveWorkspaceId &&
    projectIdFromUrl === liveProjectIdFromUrl &&
    effectiveContextId === liveCenterContextId;

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
  const visibleTerminalTabs = React.useMemo(() => {
    const extraPaint =
      Boolean(effectiveContextId) && isExtraCenterSpaceKey(effectiveContextId);
    if (extraPaint && liveExtraSpaceEmpty) return EMPTY_TERMINAL_TABS;
    if (Array.isArray(terminalTabs)) return terminalTabs;
    if (extraPaint) return EMPTY_TERMINAL_TABS;
    return [
      {
        id: FIXED_TERMINAL_TAB_VALUE,
        title: t("fallbackTerminalTitle"),
        closable: true,
      },
    ];
  }, [effectiveContextId, liveExtraSpaceEmpty, t, terminalTabs]);
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
  const previousDeepLinkRef = React.useRef<{
    tmux: string | null;
    sideChat: string | null;
  }>({ tmux: null, sideChat: null });
  const ignoreLeftoverDeepLinkRef = React.useRef(false);
  const blockedUrlTabRef = React.useRef<string | null>(null);
  const paintContextJustChanged =
    lastSeenCenterContextIdRef.current !== effectiveContextId;
  const previousPaintIdForUrl = lastSeenCenterContextIdRef.current ?? null;
  if (paintContextJustChanged) {
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

  // Deep-link query only. Live tab chrome is lastTabByContext.
  const [{ tab: tabFromUrl, wikiPage: wikiPageFromUrl, terminalTmux, sideChat }, setUrlParams] =
    useQueryStates(centerStageParams);
  const storedLastTab = useCenterStageLastTab(effectiveContextId);
  const storedWikiPage = useCenterStageWikiPage(effectiveContextId);
  const lastTabForPaint = storedLastTab;
  if (paintContextJustChanged) {
    const leftoverDeepLink =
      (Boolean(terminalTmux?.trim()) &&
        terminalTmux === previousDeepLinkRef.current.tmux) ||
      (Boolean(sideChat?.trim()) &&
        sideChat === previousDeepLinkRef.current.sideChat);
    if (leftoverDeepLink) ignoreLeftoverDeepLinkRef.current = true;
    if (previousPaintIdForUrl && tabFromUrl && tabFromUrl !== lastTabForPaint) {
      blockedUrlTabRef.current = tabFromUrl;
    }
  }
  if (!terminalTmux && !sideChat) ignoreLeftoverDeepLinkRef.current = false;
  if (tabFromUrl !== blockedUrlTabRef.current) blockedUrlTabRef.current = null;
  const honorUrlTab = shouldHonorUrlTabForPaintContext({
    tabFromUrl,
    paintId: effectiveContextId,
    previousPaintId: paintContextJustChanged
      ? previousPaintIdForUrl
      : effectiveContextId,
    lastTab: lastTabForPaint,
    terminalTmux,
    sideChat,
    previousTerminalTmux: previousDeepLinkRef.current.tmux,
    previousSideChat: previousDeepLinkRef.current.sideChat,
    ignoreLeftoverDeepLink: ignoreLeftoverDeepLinkRef.current,
    blockedUrlTab: blockedUrlTabRef.current,
  });
  previousDeepLinkRef.current = {
    tmux: terminalTmux ?? null,
    sideChat: sideChat ?? null,
  };
  const followUrlToolTab =
    honorUrlTab && !(isExtraCenterSpace && liveExtraSpaceEmpty);

  React.useEffect(() => {
    bindCenterPaintTabUrlWriter((patch) => {
      void setUrlParams({
        tab: patch.tab,
        wikiPage: patch.wikiPage ?? null,
        terminalTmux: patch.terminalTmux ?? null,
        sideChat: patch.sideChat ?? null,
      });
    });
    return () => bindCenterPaintTabUrlWriter(null);
  }, [setUrlParams]);

  React.useEffect(() => {
    if (!isCenterContextSettled || !effectiveContextId) return;
    if (isExtraCenterSpace && liveExtraSpaceEmpty && !followUrlToolTab) {
      if (tabFromUrl || wikiPageFromUrl) {
        void setUrlParams({ tab: null, wikiPage: null });
      }
      return;
    }
    if (!followUrlToolTab) {
      if (tabFromUrl || wikiPageFromUrl) {
        void setUrlParams({ tab: null, wikiPage: null });
      }
      return;
    }
    if (tabFromUrl) {
      activateCenterChromeTab(effectiveContextId, tabFromUrl);
    }
    if (wikiPageFromUrl) {
      setCenterStageWikiPage(effectiveContextId, wikiPageFromUrl);
      if (!tabFromUrl || tabFromUrl === "wiki") {
        activateCenterChromeTab(effectiveContextId, "wiki");
      }
    }
    if (tabFromUrl || wikiPageFromUrl) {
      void setUrlParams({ tab: null, wikiPage: null });
    }
  }, [
    effectiveContextId,
    followUrlToolTab,
    isCenterContextSettled,
    isExtraCenterSpace,
    liveExtraSpaceEmpty,
    setUrlParams,
    tabFromUrl,
    wikiPageFromUrl,
  ]);

  React.useEffect(() => {
    if (!effectiveContextId || !isCenterContextSettled) return;
    if (tabFromUrl) return;
    if (isExtraCenterSpaceKey(effectiveContextId) && liveExtraSpaceEmpty) return;
    const last = readCenterStageLastTab(effectiveContextId);
    if (!last) return;
    activateCenterChromeTab(effectiveContextId, last, { attach: false });
  }, [effectiveContextId, isCenterContextSettled, liveExtraSpaceEmpty, tabFromUrl]);

  const redirectMissingNamedTerminalTab = React.useCallback(() => {
    const contextId = liveCenterContextId ?? effectiveContextId;
    if (!contextId) return;
    activateCenterChromeTab(contextId, fallbackCenterTab);
  }, [effectiveContextId, fallbackCenterTab, liveCenterContextId]);

  const {
    codeReviewTabVisible,
    codeReviewUserTriggeredRef,
    projectWikiTabVisible,
    projectWikiUserTriggeredRef,
    setCodeReviewVisibleMap,
    setProjectWikiVisibleMap,
  } = useCenterStageNamedTerminalVisibility({
    currentTab: storedLastTab ?? null,
    effectiveContextId: effectiveContextId,
    isSetupBlocking,
    onMissingCodeReviewTab: redirectMissingNamedTerminalTab,
    onMissingProjectWikiTab: redirectMissingNamedTerminalTab,
  });

  const simulatorTabVisible =
    (useSimulatorCenterTabStore((s) =>
      effectiveContextId ? Boolean(s.visibleByContext[effectiveContextId]) : false,
    ) ||
      storedLastTab === SIMULATOR_TAB_VALUE);
  const openSimulatorTab = useSimulatorCenterTabStore((s) => s.open);
  const closeSimulatorTab = useSimulatorCenterTabStore((s) => s.close);

  const gitHistoryTabVisible =
    (useGitHistoryCenterTabStore((s) =>
      effectiveContextId ? Boolean(s.visibleByContext[effectiveContextId]) : false,
    ) ||
      storedLastTab === GIT_HISTORY_TAB_VALUE);
  const openGitHistoryTab = useGitHistoryCenterTabStore((s) => s.open);
  const closeGitHistoryTab = useGitHistoryCenterTabStore((s) => s.close);
  const toolTabsVisibleByContext = useToolCenterTabsStore((s) => s.visibleByContext);
  const openToolTab = useToolCenterTabsStore((s) => s.open);
  const closeToolTab = useToolCenterTabsStore((s) => s.close);
  const changesTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.changes) ||
    storedLastTab === "changes";
  const reviewTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.review) ||
    storedLastTab === "review";
  const runTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.run) ||
    storedLastTab === "run";
  const githubHubTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.github) ||
    storedLastTab === "github";
  const filesTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.files) ||
    storedLastTab === "files";
  const ptDesignTabVisible =
    Boolean(effectiveContextId && toolTabsVisibleByContext[effectiveContextId]?.["pt-design"]) ||
    storedLastTab === "pt-design";

  React.useEffect(() => {
    if (!effectiveContextId || !storedLastTab) return;
    if (storedLastTab === SIMULATOR_TAB_VALUE) {
      openSimulatorTab(effectiveContextId);
    }
  }, [effectiveContextId, openSimulatorTab, storedLastTab]);

  React.useEffect(() => {
    if (!effectiveContextId || !storedLastTab) return;
    if (storedLastTab === GIT_HISTORY_TAB_VALUE) {
      openGitHistoryTab(effectiveContextId);
    }
  }, [effectiveContextId, openGitHistoryTab, storedLastTab]);

  React.useEffect(() => {
    if (!effectiveContextId || !isCenterToolTabValue(storedLastTab)) return;
    openToolTab(effectiveContextId, storedLastTab);
  }, [effectiveContextId, openToolTab, storedLastTab]);

  /** Until experiment prefs load, preserve a wiki last-tab / deep link so we do not strip it. */
  const wikiCenterEligible = React.useMemo(() => {
    if (experimentPrefsLoaded) return centerWikiTabEnabled;
    return storedLastTab === "wiki" || tabFromUrl === "wiki";
  }, [experimentPrefsLoaded, centerWikiTabEnabled, storedLastTab, tabFromUrl]);

  const resolvedTab = React.useMemo(() => {
    if (isExtraCenterSpace && liveExtraSpaceEmpty) {
      return "";
    }
    const tab = storedLastTab || fallbackCenterTab;
    if (tab === "wiki" && experimentPrefsLoaded && !centerWikiTabEnabled) {
      return fallbackCenterTab;
    }
    if (tab === "project-wiki" && !projectWikiTabVisible) return fallbackCenterTab;
    if (tab === "code-review" && !codeReviewTabVisible) return fallbackCenterTab;
    if (tab === SIMULATOR_TAB_VALUE) return SIMULATOR_TAB_VALUE;
    if (tab === GIT_HISTORY_TAB_VALUE) return GIT_HISTORY_TAB_VALUE;
    if (isCenterToolTabValue(tab)) return tab;
    if (isTerminalCenterTabValue(tab)) {
      if (visibleTerminalTabs.some((item) => item.id === tab)) return tab;
      if (!isTerminalWorkspaceReady) return tab;
      return fallbackCenterTab;
    }
    if (isGithubCenterTabValue(tab)) {
      const target = parseGithubCenterTabValue(tab);
      return target?.contextId === effectiveContextId ? tab : fallbackCenterTab;
    }
    if (isBrowserCenterTabValue(tab)) {
      const target = parseBrowserCenterTabValue(tab);
      return target?.contextId === effectiveContextId &&
        browserTabs.some((item) => item.value === tab)
        ? tab
        : fallbackCenterTab;
    }
    return tab;
  }, [
    storedLastTab,
    experimentPrefsLoaded,
    centerWikiTabEnabled,
    projectWikiTabVisible,
    codeReviewTabVisible,
    effectiveContextId,
    fallbackCenterTab,
    isExtraCenterSpace,
    isTerminalWorkspaceReady,
    liveExtraSpaceEmpty,
    visibleTerminalTabs,
    browserTabs,
  ]);

  React.useEffect(() => {
    if (!experimentPrefsLoaded || centerWikiTabEnabled || storedLastTab !== "wiki") return;
    const contextId = liveCenterContextId ?? effectiveContextId;
    if (!contextId) return;
    activateCenterChromeTab(contextId, fallbackCenterTab);
  }, [
    experimentPrefsLoaded,
    centerWikiTabEnabled,
    fallbackCenterTab,
    storedLastTab,
    effectiveContextId,
    liveCenterContextId,
  ]);

  const setFixedTab = React.useCallback(
    (tab: FixedTab) => {
      if (tab === "wiki" && experimentPrefsLoaded && !centerWikiTabEnabled) return;
      if (tab === resolvedTab) return;
      const contextId = liveCenterContextId ?? effectiveContextId;
      if (!contextId) return;
      activateCenterChromeTab(contextId, tab);
    },
    [resolvedTab, experimentPrefsLoaded, centerWikiTabEnabled, effectiveContextId, liveCenterContextId]
  );

  const setWikiPage = React.useCallback(
    (page: string) => {
      if (experimentPrefsLoaded && !centerWikiTabEnabled) return;
      const contextId = liveCenterContextId ?? effectiveContextId;
      if (!contextId) return;
      setCenterStageWikiPage(contextId, page);
      activateCenterChromeTab(contextId, "wiki");
    },
    [experimentPrefsLoaded, centerWikiTabEnabled, effectiveContextId, liveCenterContextId]
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
      setTabStripState({ contextId: null, order: [] });
      return;
    }
    setTabStripState({
      contextId: effectiveContextId,
      order: readCenterStageTabStripOrder(effectiveContextId),
    });
  }, [effectiveContextId]);

  const handleTabStripOrderChange = React.useCallback(
    (order: string[]) => {
      if (effectiveContextId) {
        setTabStripState({ contextId: effectiveContextId, order });
        writeCenterStageTabStripOrder(effectiveContextId, order);
        return;
      }
      setTabStripState({ contextId: null, order });
    },
    [effectiveContextId],
  );

  const openFiles = getOpenFiles(effectiveContextId || undefined);
  const activeFilePath = getActiveFilePath(effectiveContextId || undefined);

  // Visual strip membership in the default (type-grouped) order. Used only to
  // seed a first saved order so newly added tabs can append at the end.
  // Group-popover order is stored separately and must not drive this list.
  const defaultStripTabIds = React.useMemo(() => {
    const surfaceTabIds = [
      ...openFiles.map((file) => ({ id: file.path, openedAt: file.lastOpenedAt })),
      ...githubTabs.map((tab) => ({ id: tab.value, openedAt: tab.openedAt })),
      ...browserTabs.map((tab) => ({ id: tab.value, openedAt: tab.openedAt })),
    ]
      .sort((left, right) => left.openedAt - right.openedAt)
      .map((item) => item.id);

    return collectDefaultCenterStripTabIds({
      terminalTabIds: visibleTerminalTabs.map((tab) => tab.id),
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
      surfaceTabIds,
    });
  }, [
    browserTabs,
    changesTabVisible,
    codeReviewTabVisible,
    filesTabVisible,
    gitHistoryTabVisible,
    githubHubTabVisible,
    githubTabs,
    openFiles,
    projectWikiTabVisible,
    ptDesignTabVisible,
    reviewTabVisible,
    runTabVisible,
    simulatorTabVisible,
    visibleTerminalTabs,
  ]);

  const appendTabToStripOrder = React.useCallback(
    (tabId: string) => {
      handleTabStripOrderChange(
        appendCenterTabToStripOrder(
          [...contextStripOrderRef.current],
          defaultStripTabIds,
          tabId,
        ),
      );
    },
    [defaultStripTabIds, handleTabStripOrderChange],
  );

  // activeValue 优先使用打开的文件路径，否则使用当前 center tab
  const activeValue = activeFilePath || resolvedTab;
  const activeValueRef = React.useRef(activeValue);
  activeValueRef.current = activeValue;
  /** Set after handleCenterStageTabChange is defined; used by close handlers above it. */
  const navigateCenterTabRef = React.useRef<
    (val: string, options?: { attach?: boolean }) => void
  >(() => {});

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
        wikiEnabled:
          centerWikiTabEnabled &&
          !(
            Boolean(effectiveContextId) &&
            isExtraCenterSpaceKey(effectiveContextId) &&
            liveExtraSpaceEmpty
          ),
        fixedAlwaysOpen:
          effectiveContextId && isExtraCenterSpaceKey(effectiveContextId)
            ? []
            : ["overview"],
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
      effectiveContextId,
      liveExtraSpaceEmpty,
      visibleTerminalTabs,
    ],
  );

  /**
   * After closing one or more tabs: prune the MRU stack, drop layout ownership,
   * and if the chrome-active tab was among them, navigate to a pane-local next
   * tab without stealing a sibling pane's surface.
   */
  const activateNextAfterClosing = React.useCallback(
    (closedValues: string | string[]) => {
      if (!effectiveContextId) return;
      const closedList = Array.isArray(closedValues) ? closedValues : [closedValues];
      if (closedList.length === 0) return;

      const layoutBefore =
        useCenterPaneLayoutStore.getState().getLayout(effectiveContextId);
      const active = activeValueRef.current;

      for (const value of closedList) {
        removeCenterTabFromActivationStack(effectiveContextId, value);
      }

      const open = collectOpenCenterTabValues(closedList);
      const liveTerminalIds = useTerminalStore
        .getState()
        .getTerminalTabs(effectiveContextId)
        .map((tab) => tab.id);
      for (const id of liveTerminalIds) open.add(id);
      for (const value of closedList) open.delete(value);

      const fallback = resolvePaneLocalCloseFallback({
        layoutBefore,
        closedTabIds: closedList,
        activeTabId: active,
        openTabValues: open,
        mruOrder: getCenterTabActivationStack(effectiveContextId),
        fallbackTab: fallbackCenterTab,
      });

      // Apply MRU to the owning pane before chrome navigates. removeTab used
      // to snap activeTabId to tabIds[0] (Overview), and attach:false would
      // leave mosaic chrome stuck there.
      for (const value of closedList) {
        useCenterPaneLayoutStore.getState().removeTab(
          effectiveContextId,
          value,
          fallback.nextTabId,
        );
      }

      if (!closedList.includes(active)) return;

      const next =
        fallback.nextTabId ??
        (open.has(fallbackCenterTab) ? fallbackCenterTab : null) ??
        (liveTerminalIds[0] ?? "overview");

      if (next && next !== active) {
        navigateCenterTabRef.current(next, { attach: false });
      } else if (!open.has(active)) {
        navigateCenterTabRef.current(liveTerminalIds[0] ?? "overview", { attach: false });
      }
    },
    [collectOpenCenterTabValues, effectiveContextId, fallbackCenterTab],
  );
  activateNextAfterClosingRef.current = activateNextAfterClosing;

  React.useEffect(() => {
    if (!honorUrlTab) return;
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
    honorUrlTab,
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
    const contextId = liveCenterContextId ?? effectiveContextId;
    if (!contextId) return;
    const tab = openBrowserCenterTab(contextId);
    requestBrowserContextUrlFocus(tab.browserContextId);
    activateCenterChromeTab(contextId, tab.value);
    appendTabToStripOrder(tab.value);
  }, [
    appendTabToStripOrder,
    effectiveContextId,
    liveCenterContextId,
    openBrowserCenterTab,
  ]);

  const handleCreateSimulatorCenterTab = React.useCallback(() => {
    const contextId = liveCenterContextId ?? effectiveContextId;
    if (!contextId) return;
    activateCenterChromeTab(contextId, SIMULATOR_TAB_VALUE);
    appendTabToStripOrder(SIMULATOR_TAB_VALUE);
  }, [
    appendTabToStripOrder,
    effectiveContextId,
    liveCenterContextId,
  ]);

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
    const contextId = liveCenterContextId ?? effectiveContextId;
    if (!contextId) return;
    activateCenterChromeTab(contextId, tab);
    appendTabToStripOrder(tab);
  }, [
    appendTabToStripOrder,
    effectiveContextId,
    liveCenterContextId,
  ]);

  const handleCloseToolTab = React.useCallback((tab: CenterToolTabValue) => {
    if (!effectiveContextId) return;
    closeToolTab(effectiveContextId, tab);
    activateNextAfterClosing(tab);
  }, [activateNextAfterClosing, closeToolTab, effectiveContextId]);

  React.useEffect(() => {
    registerBrowserHostChrome({
      showCenterBrowser: (contextId) => {
        const tab = reuseOrOpenBrowser(contextId);
        activateCenterChromeTab(contextId, tab.value);
      },
      currentContextId: () => liveCenterContextId,
    });
  }, [liveCenterContextId, reuseOrOpenBrowser]);

  // Promote / sticky leave track the live URL so warm membership is not deferred.
  useTerminalTabMountLifecycle({
    activeValue,
    effectiveContextId: liveCenterContextId,
    setMountedTerminalTabsByContext,
    visibleTerminalTabs,
  });

  useReloadOpenFilesWhenReady({
    effectiveContextId,
    isSetupBlocking,
    openFiles,
    reloadFileContent,
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

  React.useEffect(() => {
    if (!isCenterContextSettled || honorUrlTab) return;
    if (tabFromUrl || wikiPageFromUrl || (terminalTmux && ignoreLeftoverDeepLinkRef.current) || (sideChat && ignoreLeftoverDeepLinkRef.current)) {
      void setUrlParams({
        tab: null,
        wikiPage: null,
        terminalTmux: ignoreLeftoverDeepLinkRef.current ? null : terminalTmux,
        sideChat: ignoreLeftoverDeepLinkRef.current ? null : sideChat,
      });
    }
  }, [
    honorUrlTab,
    isCenterContextSettled,
    setUrlParams,
    sideChat,
    tabFromUrl,
    terminalTmux,
    wikiPageFromUrl,
  ]);

  React.useEffect(() => {
    if (!isCenterContextSettled || !effectiveContextId || !activeValue) return;
    if (isExtraCenterSpaceKey(effectiveContextId) && liveExtraSpaceEmpty) {
      return;
    }
    if (tabFromUrl) return;
    if (storedLastTab && storedLastTab !== activeValue) return;
    setCenterStageLastTab(effectiveContextId, activeValue);
    recordCenterTabActivation(effectiveContextId, activeValue);
    if (isTerminalCenterTabValue(activeValue)) {
      setActiveTerminalTab(effectiveContextId, activeValue);
    }
  }, [
    effectiveContextId,
    activeValue,
    isCenterContextSettled,
    liveExtraSpaceEmpty,
    setActiveTerminalTab,
    storedLastTab,
    tabFromUrl,
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
    if (!honorUrlTab) return;
    if (isSetupBlocking) return;
    if (currentView !== "workspace" && currentView !== "project") return;
    if (!isTerminalWorkspaceReady) return;

    const targetSpaceId = spaceIdFromTmuxWindowName(tmux);
    if (liveHostContextId) {
      const hostSpaces = useCenterSpaceStore.getState().list(liveHostContextId);
      const targetSpaceExists =
        targetSpaceId === DEFAULT_CENTER_SPACE_ID ||
        hostSpaces.some((space) => space.id === targetSpaceId);
      if (targetSpaceExists && liveActiveSpaceId !== targetSpaceId) {
        void switchCenterSpace(liveHostContextId, targetSpaceId);
        return;
      }
      if (
        targetSpaceExists &&
        parseCenterSpaceKey(effectiveContextId).spaceId !== targetSpaceId
      ) {
        return;
      }
    }

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
      activateCenterChromeTab(effectiveContextId, owningTab);
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
    honorUrlTab,
    isSetupBlocking,
    isTerminalWorkspaceReady,
    liveActiveSpaceId,
    liveHostContextId,
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
    activateCenterChromeTab(effectiveContextId, targetTerminalTabId);
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
      activateCenterChromeTab(effectiveContextId, targetTerminalTabId);
      runWhenTerminalGridReady(targetTerminalTabId, (grid) => {
        void grid.createAndRunTerminal({ label, command });
      });
    },
    [activeFilePath, effectiveContextId, ensureRunnableTerminalTab, runWhenTerminalGridReady, setActiveFile],
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
      appendTabToStripOrder(nextTab.id);
      activateCenterChromeTab(effectiveContextId, nextTab.id);

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
      appendTabToStripOrder,
      createTerminalTab,
      currentView,
      effectiveContextId,
      projects,
      runWhenTerminalGridReady,
      setActiveFile,
    ],
  );

  React.useEffect(() => {
    useAgentFixLauncherStore.getState().setRunner(handleRunAgentFixInTerminal);
    return () => {
      useAgentFixLauncherStore.getState().setRunner(null);
    };
  }, [handleRunAgentFixInTerminal]);

  const handleCreateTerminalCenterTab = React.useCallback(() => {
    const contextId = liveCenterContextId ?? effectiveContextId;
    if (!contextId) return;
    const nextTab = createTerminalTab(contextId);
    appendTabToStripOrder(nextTab.id);
    activateCenterChromeTab(contextId, nextTab.id);

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
    appendTabToStripOrder,
    createTerminalTab,
    effectiveContextId,
    liveCenterContextId,
    runWhenTerminalGridReady,
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
        void systemApi.killTmuxWindow(hostIdFromCenterKey(effectiveContextId), tmuxWindowName).catch((error) => {
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
        await systemApi.killTmuxWindow(
          hostIdFromCenterKey(detail.workspaceId),
          detail.tmuxWindowName,
        );
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

  const handleCenterStageTabChange = React.useCallback((
    val: string,
    options?: { attach?: boolean },
  ) => {
    const attach = options?.attach !== false;
    const writeContextId = liveCenterContextId ?? effectiveContextId;
    if (!writeContextId || !val) return;
    if (val === "wiki" && experimentPrefsLoaded && !centerWikiTabEnabled) {
      activateCenterChromeTab(writeContextId, FIXED_TERMINAL_TAB_VALUE, { attach });
      return;
    }
    activateCenterChromeTab(writeContextId, val, { attach });
    if (isTerminalCenterTabValue(val)) {
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
    }
  }, [
    centerWikiTabEnabled,
    effectiveContextId,
    experimentPrefsLoaded,
    liveCenterContextId,
    runWhenTerminalGridReady,
  ]);
  navigateCenterTabRef.current = handleCenterStageTabChange;

  useCenterStageKeyboardShortcuts({
    effectiveContextId,
    handleCenterStageTabChange,
    visibleTerminalTabs,
  });

  const {
    groupedTabItems,
    handleTabGroupDragEnd,
    orderGroupsForPane,
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
  const paintContextId: string | null = liveCenterContextId;
  const renderContextId: string = effectiveContextId ?? liveCenterContextId ?? "";
  const mosaicWriteContextId = paintContextId || renderContextId;
  const storedStripForRenderContext = React.useMemo(() => {
    if (!renderContextId || tabStripState.contextId === renderContextId) {
      return tabStripState.order;
    }
    return readCenterStageTabStripOrder(renderContextId);
  }, [renderContextId, tabStripState.contextId, tabStripState.order]);
  const contextStripOrder = resolveStripOrderForContext({
    contextId: renderContextId || null,
    reactStripContextId: tabStripState.contextId,
    reactStripOrder: tabStripState.order,
    storedStripOrder: storedStripForRenderContext,
  });
  contextStripOrderRef.current = contextStripOrder;

  // --- Multi-pane center layout (dnd-kit grid) — hooks before any early return ---
  const hydratePaneLayout = useCenterPaneLayoutStore((s) => s.hydrate);
  const ensurePaneLayout = useCenterPaneLayoutStore((s) => s.ensureLayout);
  // Mosaic chrome follows the painted workspace immediately. Deferred
  // `renderContextId` lags hops (useDeferredValue) and would morph the
  // previous split into the destination after warm content is already visible.
  const mosaicContextId = paintContextId ?? "";
  const paneLayout = useCenterPaneLayoutStore((s) =>
    mosaicContextId ? (s.byContext[mosaicContextId] ?? null) : null,
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
  const centerStageFullscreenRef = React.useRef<HTMLElement | null>(null);
  useCenterStageFullscreenMotion(centerStageFullscreenRef);
  const isCenterFullscreen = useCenterStageFullscreenStore((s) => s.isFullscreen);
  const fullscreenPaneId = useCenterStageFullscreenStore((s) => s.paneId);
  const setCenterFullscreen = useCenterStageFullscreenStore((s) => s.setFullscreen);
  const activeFullscreenPaneId =
    isCenterFullscreen ? fullscreenPaneId : null;

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

  const resolvedPaneLayout = React.useMemo(() => {
    if (paneLayout) return paneLayout;
    if (isExtraCenterSpaceKey(mosaicContextId)) {
      return createEmptyCenterLayout();
    }
    // During a hop the deferred open-tab list still belongs to the previous
    // context. Do not seed the destination mosaic with those tabs.
    if (mosaicContextId && mosaicContextId !== renderContextId) {
      return createDefaultLayout(["terminal"], "terminal");
    }
    return createDefaultLayout(
      applyLegacyStripOrder(openTabIdList, contextStripOrder),
      activeValue,
    );
  }, [
    activeValue,
    contextStripOrder,
    mosaicContextId,
    openTabIdList,
    paneLayout,
    renderContextId,
  ]);

  React.useEffect(() => {
    if (!renderContextId) return;
    if (!openTabSourcesHydrated) return;
    const existingLayout = useCenterPaneLayoutStore.getState().getLayout(renderContextId);
    if (existingLayout && isFreshEmptyCenterLayout(existingLayout)) {
      return;
    }
    // Reconcile open-tab membership only. Do NOT auto-openTab from URL here —
    // that steals surfaces between multi-panes whenever `?tab=` changes.
    // Explicit navigation (tab click / create / hotkey) calls openTab itself.
    ensurePaneLayout(
      renderContextId,
      applyLegacyStripOrder(openTabIdList, contextStripOrder),
      activeValue,
      contextStripOrder,
    );
  }, [
    activeValue,
    contextStripOrder,
    ensurePaneLayout,
    openTabIdKey,
    openTabIdList,
    openTabSourcesHydrated,
    renderContextId,
  ]);
  const isMultiPane = resolvedPaneLayout.order.length > 1;
  const paneCount = resolvedPaneLayout.order.length;
  const prevLayoutContextRef = React.useRef<{
    contextId: string;
    paneCount: number;
  } | null>(null);
  const [mosaicHold, setMosaicHold] = React.useState(false);
  const persistCollapsedStripContextRef = React.useRef<{
    contextId: string;
    order: string[];
  } | null>(null);
  const prevLayoutContext = prevLayoutContextRef.current;
  const paneCountTransition = {
    prevContextId: prevLayoutContext?.contextId,
    nextContextId: mosaicContextId,
    prevPaneCount: prevLayoutContext?.paneCount ?? paneCount,
    nextPaneCount: paneCount,
  };
  const seedFromFullPane = shouldSeedMosaicFromFullPane(paneCountTransition);
  if (shouldHoldMosaicAfterCollapse(paneCountTransition) && renderContextId) {
    const remainingId = resolvedPaneLayout.order[0];
    const remaining =
      resolvedPaneLayout.panes.find((pane) => pane.id === remainingId) ??
      resolvedPaneLayout.panes[0];
    const persist = collapsedStripOrderForContext({
      collapsingContextId: renderContextId,
      destinationContextId: renderContextId,
      prevPaneCount: paneCountTransition.prevPaneCount,
      nextPaneCount: paneCountTransition.nextPaneCount,
      remainingTabIds: remaining?.tabIds,
    });
    if (persist) persistCollapsedStripContextRef.current = persist;
    if (!mosaicHold) setMosaicHold(true);
  } else if (
    prevLayoutContext &&
    mosaicContextId &&
    prevLayoutContext.contextId !== mosaicContextId &&
    mosaicHold
  ) {
    setMosaicHold(false);
  }
  if (paneCount > 1 && mosaicHold) {
    setMosaicHold(false);
  }
  prevLayoutContextRef.current = {
    contextId: mosaicContextId,
    paneCount,
  };
  const showMosaic =
    isMultiPane ||
    mosaicHold ||
    (isExtraCenterSpace && isFreshEmptyCenterLayout(resolvedPaneLayout));
  React.useEffect(() => {
    const pending = persistCollapsedStripContextRef.current;
    if (!pending) return;
    persistCollapsedStripContextRef.current = null;
    writeCenterStageTabStripOrder(pending.contextId, pending.order);
    if (pending.contextId === renderContextId) {
      setTabStripState({ contextId: pending.contextId, order: pending.order });
    }
  }, [paneCount, renderContextId]);
  React.useEffect(() => {
    if (!mosaicHold) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      () => setMosaicHold(false),
      reduce ? 0 : CENTER_PANE_LAYOUT_MOTION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [mosaicHold]);
  React.useEffect(() => {
    setCenterFullscreen(false);
  }, [mosaicContextId, setCenterFullscreen]);
  React.useEffect(() => {
    if (!activeFullscreenPaneId) return;
    if (!resolvedPaneLayout.order.includes(activeFullscreenPaneId)) {
      setCenterFullscreen(false);
    }
  }, [activeFullscreenPaneId, resolvedPaneLayout.order, setCenterFullscreen]);
  const paneSlotBoxes = useCenterPaneSlotBoxes(
    panelHostRef,
    resolvedPaneLayout,
    showMosaic,
    mosaicContextId,
    activeFullscreenPaneId,
  );
  const multiActiveTabIds = React.useMemo(() => {
    if (!showMosaic) return null;
    // Always pass a list when multi-pane so content slots position correctly
    // even if only one pane has an active tab (others empty).
    return collectActiveTabIds(resolvedPaneLayout);
  }, [resolvedPaneLayout, showMosaic]);
  const tabToPaneId = React.useMemo(() => {
    if (!showMosaic) return null;
    return buildTabToPaneId(resolvedPaneLayout);
  }, [resolvedPaneLayout, showMosaic]);
  const focusedPaneIdRef = React.useRef(resolvedPaneLayout.focusedPaneId);
  focusedPaneIdRef.current = resolvedPaneLayout.focusedPaneId;

  const handleOverlayPaneInteraction = React.useCallback(
    (event: { target: EventTarget | null }) => {
      if (!showMosaic || !mosaicWriteContextId) return;
      const paneId = paneIdFromOverlayEventTarget(event.target);
      if (
        !shouldFocusOwningPane({
          paneId,
          focusedPaneId: focusedPaneIdRef.current,
        })
      ) {
        return;
      }
      focusCenterPane(mosaicWriteContextId, paneId!);
    },
    [focusCenterPane, mosaicWriteContextId, showMosaic],
  );

  React.useEffect(() => {
    if (!showMosaic) return;
    const onCapture = (event: Event) => {
      handleOverlayPaneInteraction(event);
    };
    // Native capture sees Electron <webview> focusin and maximized browser
    // portals on document.body — React overlay-host listeners cannot.
    document.addEventListener("pointerdown", onCapture, true);
    document.addEventListener("focusin", onCapture, true);
    return () => {
      document.removeEventListener("pointerdown", onCapture, true);
      document.removeEventListener("focusin", onCapture, true);
    };
  }, [handleOverlayPaneInteraction, showMosaic]);

  const handleSplitRight = React.useCallback(() => {
    if (!mosaicWriteContextId) return;
    if (resolvedPaneLayout.panes.length >= MAX_CENTER_PANES) return;
    // Empty pane — no tab steal; launcher empty state.
    splitCenterPane(mosaicWriteContextId, "right");
  }, [mosaicWriteContextId, resolvedPaneLayout.panes.length, splitCenterPane]);

  const handleSplitDown = React.useCallback(() => {
    if (!mosaicWriteContextId) return;
    if (resolvedPaneLayout.panes.length >= MAX_CENTER_PANES) return;
    splitCenterPane(mosaicWriteContextId, "down");
  }, [mosaicWriteContextId, resolvedPaneLayout.panes.length, splitCenterPane]);

  const handlePaneTabChange = React.useCallback(
    (paneId: string, tabValue: string) => {
      if (!mosaicWriteContextId) return;
      // Overview always activates on the primary pane.
      const targetPaneId =
        tabValue === OVERVIEW_TAB_ID
          ? (resolvedPaneLayout.panes.find((p) =>
              isPrimaryPane(resolvedPaneLayout, p.id),
            )?.id ?? paneId)
          : paneId;
      // Focus first so exclusive openTab lands on this pane (not a sibling).
      focusCenterPane(mosaicWriteContextId, targetPaneId);
      // Exclusive ownership + URL chrome. openTab removes tab from other panes.
      setPaneActiveTab(mosaicWriteContextId, targetPaneId, tabValue);
      handleCenterStageTabChange(tabValue);
    },
    [
      focusCenterPane,
      handleCenterStageTabChange,
      mosaicWriteContextId,
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

  const handleCreateCenterSpace = React.useCallback(
    (name?: string) => {
      if (!liveHostContextId) return;
      void openNewCenterSpace(liveHostContextId, name);
    },
    [liveHostContextId],
  );

  const handleApplyCenterLayout = React.useCallback(
    (layoutId: string) => {
      if (!liveHostContextId) return;
      const saved = useCenterPaneSavedLayoutStore.getState().getById(layoutId);
      if (!saved) return;
      void (async () => {
      const space = await openNewCenterSpace(liveHostContextId, saved.name);
      if (!space) return;
      const paintId = makeCenterSpaceKey(liveHostContextId, space.id);

      const surfaces = collectSavedSurfaces(saved);
      let browserTabValue: string | null = null;
      let terminalTabId: string | null = null;

      if (surfaces.includes("browser")) {
        const tab = openBrowserCenterTab(paintId);
        browserTabValue = tab.value;
        requestBrowserContextUrlFocus(tab.browserContextId);
      }
      if (surfaces.includes("terminal")) {
        terminalTabId = createTerminalTab(paintId).id;
      }
      if (surfaces.includes("simulator")) {
        openSimulatorTab(paintId);
      }
      for (const surface of surfaces) {
        if (isToolSurfaceKind(surface)) {
          openToolTab(paintId, surface);
        }
      }

      const resolveTabId = (kind: CenterSurfaceKind) => {
        if (kind === "terminal") {
          return terminalTabId || FIXED_TERMINAL_TAB_VALUE;
        }
        return resolveSurfaceTabId(kind, { browserTabId: browserTabValue });
      };
      const liveLayout = materializeSavedLayout(saved, resolveTabId);
      setCenterPaneLayout(paintId, liveLayout);
      useWorkspaceSurfaceCacheStore.getState().beginVisualSwitch(paintId);

      const focused =
        liveLayout.panes.find((p) => p.id === liveLayout.focusedPaneId) ??
        liveLayout.panes[0];
      if (focused?.activeTabId) {
        activateCenterChromeTab(paintId, focused.activeTabId);
      }
      })();
    },
    [
      createTerminalTab,
      liveHostContextId,
      openBrowserCenterTab,
      openSimulatorTab,
      openToolTab,
      setCenterPaneLayout,
    ],
  );

  // Gate on live URL so deferred lag never flashes the empty/welcome chrome mid-hop.
  if (!liveHostContextId || !paintContextId) {
    return (
      <CenterStageNoContextView
        currentView={currentView}
        automationsEnabled={automationsEnabled}
        ptDesignOpen={storedLastTab === "pt-design" || tabFromUrl === "pt-design"}
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
      if (opts?.paneId && mosaicWriteContextId) {
        focusCenterPane(mosaicWriteContextId, opts.paneId);
      }
      run();
    };
    const layoutPaneId =
      opts?.paneId ??
      (resolvedPaneLayout.order.length === 1 ? resolvedPaneLayout.order[0] : undefined);
    const paneTabIds = layoutPaneId
      ? resolvedPaneLayout.panes.find((pane) => pane.id === layoutPaneId)?.tabIds
      : undefined;
    const paneStripOrder = resolvePaneTabStripOrder(paneTabIds, contextStripOrder);
    const paneGroupedItems = orderGroupsForPane(
      filterGroupedTabItemsByAllowedIds(groupedTabItems, allowed),
      layoutPaneId,
    );
    return (
      <CenterStageTabBar
        activeValue={opts?.activeTabId ?? activeValue}
        browserFallbackLabel={browserFallbackLabel}
        browserTabs={filterIds(browserTabs, (tab) => tab.value)}
        codeReviewTabVisible={codeReviewTabVisible && has("code-review")}
        effectiveContextId={renderContextId}
        githubTabs={filterIds(githubTabs, (tab) => tab.value)}
        openFiles={filterIds(openFiles, (file) => file.path)}
        orderedGroupedTabItems={paneGroupedItems}
        tabStripOrder={paneStripOrder}
        onTabStripOrderChange={(order) => {
          if (layoutPaneId && mosaicWriteContextId && isMultiPane) {
            useCenterPaneLayoutStore.getState().reorderTabs(
              mosaicWriteContextId,
              layoutPaneId,
              order,
            );
            return;
          }
          handleTabStripOrderChange(order);
          const singlePaneId =
            layoutPaneId ??
            (resolvedPaneLayout.order.length === 1 ? resolvedPaneLayout.order[0] : undefined);
          if (singlePaneId && mosaicWriteContextId) {
            useCenterPaneLayoutStore.getState().reorderTabs(
              mosaicWriteContextId,
              singlePaneId,
              order,
            );
          }
        }}
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
        handleTabGroupDragEnd={(event) =>
          handleTabGroupDragEnd(event, opts?.paneId, paneGroupedItems)
        }
        pinFile={pinFile}
        setCodeReviewCloseConfirmOpen={setCodeReviewCloseConfirmOpen}
        setProjectWikiCloseConfirmOpen={setProjectWikiCloseConfirmOpen}
        setTabContextMenu={setTabContextMenu}
        setWikiRefreshing={setWikiRefreshing}
        setWikiRefreshTrigger={setWikiRefreshTrigger}
        paneId={layoutPaneId}
        onSplitRight={handleSplitRight}
        onSplitDown={handleSplitDown}
        savedLayouts={savedLayouts.map((layout) => ({
          id: layout.id,
          name: layout.name,
        }))}
        onSaveLayout={handleSaveCenterLayout}
        onApplyLayout={handleApplyCenterLayout}
        onCreateSpace={(name) => handleCreateCenterSpace(name)}
      />
    );
  };

  const panels = (
    <CenterStagePanels
      activeValue={activeValue}
      activeTabIds={multiActiveTabIds}
      tabToPaneId={tabToPaneId}
      paneSlotBoxes={isMultiPane ? paneSlotBoxes : null}
      fullscreenPaneId={activeFullscreenPaneId}
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
      wikiPageFromUrl={storedWikiPage ?? wikiPageFromUrl}
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
    <div
      data-center-stage-fullscreen-slot=""
      className="relative h-full min-h-0 w-full"
    >
      <main
        ref={centerStageFullscreenRef}
        className={cn(CENTER_STAGE_SHELL_CLASS, CENTER_STAGE_GUTTER_CLASS)}
      >
      {showMosaic ? (
        <div data-center-stage-card="" className="desktop-no-drag relative min-h-0 flex-1">
          <div className="absolute inset-0 min-h-0">
            <CenterPaneGrid
              layout={resolvedPaneLayout}
              contextId={mosaicContextId}
              fullscreenPaneId={activeFullscreenPaneId}
              seedFromFullPane={seedFromFullPane}
              onTreeChange={(tree) => {
                if (mosaicWriteContextId) setCenterPaneTree(mosaicWriteContextId, tree);
              }}
              onFocus={(paneId) => {
                if (!mosaicWriteContextId) return;
                focusCenterPane(mosaicWriteContextId, paneId);
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
                  if (mosaicWriteContextId) {
                    focusCenterPane(mosaicWriteContextId, pane.id);
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
                          primary || !mosaicWriteContextId
                            ? undefined
                            : () => closeCenterPane(mosaicWriteContextId, pane.id)
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
            data-center-panel-host=""
            className="pointer-events-none absolute inset-0 min-h-0"
            style={
              activeFullscreenPaneId
                ? { zIndex: CENTER_STAGE_FULLSCREEN_Z_INDEX + 1 }
                : undefined
            }
            onPointerDownCapture={handleOverlayPaneInteraction}
            onFocusCapture={handleOverlayPaneInteraction}
          >
            {panels}
          </div>
        </div>
      ) : (
        <Tabs
          value={activeValue}
          onValueChange={(value) => handleCenterStageTabChange(value)}
          // isolate helps clip xterm WebGL to the rounded card corners.
          data-center-stage-card=""
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-0 isolate",
            CENTER_STAGE_CARD_CLASS,
          )}
        >
          {renderTabBar({
            paneId: resolvedPaneLayout.order[0],
            activeTabId: activeValue,
          })}
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
    </div>
  );
};

export default CenterStage;
