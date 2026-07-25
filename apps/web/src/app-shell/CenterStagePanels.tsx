"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Loader2, TabsPanel, toastManager } from "@workspace/ui";
import type { ReviewTarget } from "@/api/ws-api";
import { systemApi } from "@/api/rest-api";
import {
  ReviewContextProvider,
} from "@/features/diff/components/review/ReviewContextProvider";
import { OverviewTab } from "@/features/workspace/components/OverviewTab";
import {
  EDITOR_REVIEW_DIFF_PREFIX,
  getEditorSourcePath,
  getReviewGroupRevisionGuid,
  isConflictResolveEditorPath,
  isReviewGroupEditorPath,
  type OpenFile,
} from "@/features/editor/store/use-editor-store";
import {
  FIXED_TERMINAL_TAB_VALUE,
  PROJECT_WIKI_WINDOW_NAME,
  type TerminalCenterTab,
} from "@/features/terminal/store/use-terminal-store";
import type { FixedTab } from "@/shared/lib/nuqs/searchParams";
import { isDiffGroupEditorPath } from "@/features/diff/lib/diff-editor-paths";
import { cn } from "@/shared/lib/utils";
import type { TerminalGridHandle } from "@/features/terminal/components/TerminalGrid";
import type { PendingNamedTerminalRun } from "@/app-shell/center-stage-support";
import type { TerminalPaneAgent } from "@/features/terminal/types/index";
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import type { Project, Workspace } from "@/shared/types/domain";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
import type { GithubCenterTab } from "@/features/github/store/use-github-center-tabs";
import type { BrowserCenterTab } from "@/features/run-preview/store/use-browser-center-tabs";
import {
  isFramePanelVisible,
  pruneStickyLeavingContexts,
  pushStickyLeavingContext,
  resolveContextIdsToRender,
  resolveFrameActiveTab,
  editorMountKey,
  browserMountKey,
  lightMountKey,
  namedTerminalMountKey,
  terminalMountKey,
  isKeyMounted,
} from "@/app-shell/workspace-surface-policies";
import { scheduleIdle } from "@/app-shell/workspace-surface-switch";
import { readCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useGithubCenterTabsStore } from "@/features/github/store/use-github-center-tabs";
import { useBrowserCenterTabsStore } from "@/features/run-preview/store/use-browser-center-tabs";

function TerminalGridLoadingFallback() {
  const t = useTranslations("appShell.centerStagePanels");

  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {t("loadingTerminal")}
        </span>
      </div>
    </div>
  );
}

const WikiTab = dynamic(
  () => import("@/features/wiki").then((m) => m.WikiTab),
  { ssr: false },
);

const ChangesCodeView = dynamic(
  () =>
    import("@/features/diff/components/ChangesCodeView").then((m) => m.ChangesCodeView),
  { ssr: false },
);
const DiffViewer = dynamic(
  () => import("@/features/diff/components/DiffViewer").then((m) => m.DiffViewer),
  { ssr: false },
);
const ReviewCodeView = dynamic(
  () => import("@/features/diff/components/ReviewCodeView").then((m) => m.ReviewCodeView),
  { ssr: false },
);

const GitConflictResolver = dynamic(
  () =>
    import("@/features/diff/components/GitConflictResolver").then(
      (m) => m.GitConflictResolver,
    ),
  { ssr: false },
);

const FileViewer = dynamic(() => import("@/features/editor/components/FileViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

const PRDetailView = dynamic(
  () =>
    import("@/features/github/components/PRDetailView").then(
      (mod) => mod.PRDetailView,
    ),
  { ssr: false },
);

const ActionsDetailView = dynamic(
  () =>
    import("@/features/github/components/ActionsDetailView").then(
      (mod) => mod.ActionsDetailView,
    ),
  { ssr: false },
);

const TerminalGrid = dynamic(
  () =>
    import("@/features/terminal/components/TerminalGrid").then(
      (mod) => mod.TerminalGrid,
    ),
  {
    ssr: false,
    loading: () => <TerminalGridLoadingFallback />,
  },
);

const BrowserPanel = dynamic(
  () =>
    import("@/features/run-preview/components/BrowserPanel").then(
      (mod) => mod.BrowserPanel,
    ),
  { ssr: false },
);

type TerminalQuickOpenAgent = {
  agent: TerminalPaneAgent;
  command: string;
};

interface CenterStagePanelsProps {
  activeValue: string;
  browserTabs: BrowserCenterTab[];
  codeReviewTabVisible: boolean;
  codeReviewTerminalGridRef: React.RefObject<TerminalGridHandle | null>;
  currentBranch?: string | null;
  currentProject?: Project;
  currentRepoPath?: string | null;
  currentView: string;
  currentWorkspace?: Workspace;
  effectiveContextId: string;
  githubTabs: GithubCenterTab[];
  handleCloseGithubTab: (value: string) => void;
  handleCreateTerminalCenterTab: () => void;
  handleTerminalPaneClosed: (event: {
    paneId: string;
    pane: TerminalPaneProps;
    terminalTabId: string;
    isLastPane: boolean;
  }) => void;

  openFiles: OpenFile[];
  onGithubPullRequestChanged: () => void;
  projectWikiTabVisible: boolean;
  projectWikiTerminalGridRef: React.RefObject<TerminalGridHandle | null>;
  projectWikiUserTriggeredRef: React.RefObject<boolean>;
  reviewTarget: ReviewTarget | null;
  setFixedTab: (tab: FixedTab) => void;
  setProjectWikiPendingCommand: React.Dispatch<React.SetStateAction<PendingNamedTerminalRun | null>>;
  setProjectWikiVisibleMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setWikiPage: (page: string) => void;
  terminalGridRef: React.RefObject<TerminalGridHandle | null>;
  terminalGridRefs: React.RefObject<Record<string, TerminalGridHandle | null>>;
  terminalQuickOpenAgents: TerminalQuickOpenAgent[];
  visibleTerminalTabs: TerminalCenterTab[];
  wikiCenterEligible: boolean;
  wikiPageFromUrl?: string | null;
  wikiRefreshTrigger: number;
  mountedTerminalTabsByContext: Record<string, string[]>;
}

export function CenterStagePanels({
  activeValue,
  browserTabs,
  codeReviewTabVisible,
  codeReviewTerminalGridRef,
  currentBranch,
  currentProject,
  currentRepoPath,
  currentView,
  currentWorkspace,
  effectiveContextId,
  githubTabs,
  handleCloseGithubTab,
  handleCreateTerminalCenterTab,
  handleTerminalPaneClosed,

  openFiles,
  onGithubPullRequestChanged,
  projectWikiTabVisible,
  projectWikiTerminalGridRef,
  projectWikiUserTriggeredRef,
  reviewTarget,
  setFixedTab,
  setProjectWikiPendingCommand,
  setProjectWikiVisibleMap,
  setWikiPage,
  terminalGridRef,
  terminalGridRefs,
  terminalQuickOpenAgents,
  visibleTerminalTabs,
  wikiCenterEligible,
  wikiPageFromUrl,
  wikiRefreshTrigger,
  mountedTerminalTabsByContext,
}: CenterStagePanelsProps) {
  const t = useTranslations("appShell.centerStagePanels");
  // Defer the active-frame flip so rapid hops skip intermediate multi-frame commits.
  // Sticky leave still tracks live `effectiveContextId` so terminals do not unmount.
  const displayContextId = React.useDeferredValue(effectiveContextId);
  // Prefer id lists over full warm entry objects — lastAccessed churn must not re-render.
  const warmIds = useWorkspaceSurfaceCacheStore((s) =>
    s.warm.map((w) => w.contextId).join("\0"),
  );
  const mountPlan = useWorkspaceSurfaceCacheStore((s) => s.mountPlan);
  const setSurfaceSnapshot = useWorkspaceSurfaceCacheStore((s) => s.setSurfaceSnapshot);
  const allWorkspaceTerminalTabs = useTerminalStore((s) => s.workspaceTerminalTabs);
  const workspaceContexts = useTerminalStore((s) => s.workspaceContexts);
  // Structural fingerprint only (scope → pane ids). Dynamic title / agent metadata
  // updates must NOT re-render CenterStagePanels or re-run mount-budget snapshots.
  const terminalPaneStructureKey = useTerminalStore((s) => {
    const panesByScope = s.workspacePanes;
    const scopeKeys = Object.keys(panesByScope);
    if (scopeKeys.length === 0) return "";
    scopeKeys.sort();
    let out = "";
    for (const scopeKey of scopeKeys) {
      const ids = Object.keys(panesByScope[scopeKey] ?? {});
      ids.sort();
      out += `${scopeKey}:${ids.join(",")};`;
    }
    return out;
  });
  const getOpenFiles = useEditorStore((s) => s.getOpenFiles);
  const githubTabsByContext = useGithubCenterTabsStore((s) => s.tabsByContext);
  const browserTabsByContext = useBrowserCenterTabsStore((s) => s.tabsByContext);

  // Keep the workspace we just left mounted for this render, before the WSC
  // `touch()` effect promotes it into `warm`. Otherwise Terminal unmounts,
  // disconnects the PTY WS, and remounts with "Connecting to terminal...".
  const lastEffectiveContextRef = React.useRef(effectiveContextId);
  const stickyLeavingIdsRef = React.useRef<string[]>([]);
  if (lastEffectiveContextRef.current !== effectiveContextId) {
    stickyLeavingIdsRef.current = pushStickyLeavingContext(
      stickyLeavingIdsRef.current,
      lastEffectiveContextRef.current,
      effectiveContextId,
    );
    lastEffectiveContextRef.current = effectiveContextId;
  }
  const warmIdList = warmIds ? warmIds.split("\0").filter(Boolean) : [];
  stickyLeavingIdsRef.current = pruneStickyLeavingContexts(stickyLeavingIdsRef.current, {
    effectiveContextId,
    warmIds: warmIdList,
  });
  const contextIdsToRender = resolveContextIdsToRender({
    effectiveContextId,
    warmIds: warmIdList,
    stickyLeavingIds: stickyLeavingIdsRef.current,
  });

  // Publish surface snapshots once per structural change (effect cleanup cancels
  // superseded idle work so rapid hops do not run intermediate snapshots).
  const snapshotGenRef = React.useRef(0);
  React.useEffect(() => {
    const contextIds = contextIdsToRender;
    const gen = ++snapshotGenRef.current;
    return scheduleIdle(() => {
      if (gen !== snapshotGenRef.current) return;
      // Read panes live so we pick up structure at idle time without subscribing
      // to title-level workspacePanes updates.
      const liveGetPanes = useTerminalStore.getState().getPanes;
      // Prefer displayContextId so deferred hops do not write active snapshots for
      // intermediate contexts that were skipped.
      const activeId = displayContextId;
      for (const contextId of contextIds) {
        const isActive = contextId === activeId;
        const tabs =
          allWorkspaceTerminalTabs[contextId] ??
          (isActive
            ? visibleTerminalTabs
            : [{ id: FIXED_TERMINAL_TAB_VALUE, title: "Term", closable: true }]);
        const files = getOpenFiles(contextId);
        const last = readCenterStageLastTab(contextId);
        const validForContext = [
          ...tabs.map((tab) => tab.id),
          ...files.map((f) => f.path),
          ...((githubTabsByContext[contextId] ?? []).map((tab) => tab.value)),
          ...((browserTabsByContext[contextId] ?? []).map((b) => b.value)),
          "overview",
          "wiki",
          "project-wiki",
          "code-review",
          FIXED_TERMINAL_TAB_VALUE,
        ];
        const frameActiveTab = resolveFrameActiveTab({
          isActiveFrame: isActive,
          urlOrEditorTab: isActive ? activeValue : null,
          lastCenterTab: last,
          fallbackTab: FIXED_TERMINAL_TAB_VALUE,
          validTabs: validForContext,
        });
        const lightIds: string[] = [];
        if (frameActiveTab === "overview" || frameActiveTab === "wiki") {
          lightIds.push(frameActiveTab);
        }
        // GitHub center tabs are light surfaces — only last-active / active-tab ids enter mount plan.
        const ghTabs = githubTabsByContext[contextId] ?? [];
        for (const tab of ghTabs) {
          if (frameActiveTab === tab.value || (isActive && activeValue === tab.value)) {
            lightIds.push(tab.value);
          }
        }
        const named: Array<"project-wiki" | "code-review"> = [];
        if (
          frameActiveTab === "project-wiki" ||
          (isActive && projectWikiTabVisible)
        ) {
          named.push("project-wiki");
        }
        if (
          frameActiveTab === "code-review" ||
          (isActive && codeReviewTabVisible)
        ) {
          named.push("code-review");
        }
        const terminalTabIds = (isActive
          ? mountedTerminalTabsByContext[contextId] ?? tabs.map((t) => t.id)
          : mountedTerminalTabsByContext[contextId] ?? [FIXED_TERMINAL_TAB_VALUE]
        ).filter(Boolean);
        const terminalPaneCountByTabId: Record<string, number> = {};
        for (const tabId of terminalTabIds) {
          const panes = liveGetPanes(
            contextId,
            tabId === FIXED_TERMINAL_TAB_VALUE ? undefined : tabId,
          );
          terminalPaneCountByTabId[tabId] = Math.max(1, Object.keys(panes ?? {}).length);
        }
        setSurfaceSnapshot({
          contextId,
          terminalTabIds,
          terminalPaneCountByTabId,
          editorPathsRecent: files.map((f) => f.path),
          browserTabValues: (browserTabsByContext[contextId] ?? []).map((b) => b.value),
          lightIds,
          namedTerminals: named,
          frameActiveTab,
        });
      }
    });
    // Intentionally omit setSurfaceSnapshot identity churn; store no-ops identical snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid mountPlan-driven loops
  }, [
    activeValue,
    allWorkspaceTerminalTabs,
    browserTabsByContext,
    codeReviewTabVisible,
    contextIdsToRender.join(","),
    displayContextId,
    getOpenFiles,
    githubTabsByContext,
    mountedTerminalTabsByContext,
    // Structure only — titles/agent fields must not appear here.
    terminalPaneStructureKey,
    projectWikiTabVisible,
    visibleTerminalTabs,
  ]);

  return (
    <>
      {/* Stack workspace frames like terminal tabs: keep warm DOM mounted, CSS-hide only. */}
      <div className="relative flex-1 min-h-0 min-w-0 w-full">
      {contextIdsToRender.map((contextId) => {
        // Live URL drives sticky keep-alive; deferred id drives which frame is visible
        // so rapid hops skip intermediate multi-frame visibility flips.
        const isActiveContext = contextId === displayContextId;
        const mountedTabs = mountedTerminalTabsByContext[contextId] || [];
        // Base tab list from store (or active visible tabs). For warm/sticky frames,
        // also re-introduce any mount-book tab ids so keep-alive grids are not filtered
        // out when `allWorkspaceTerminalTabs` briefly lags behind.
        const baseTabs = isActiveContext
          ? visibleTerminalTabs
          : allWorkspaceTerminalTabs[contextId] || [
              { id: FIXED_TERMINAL_TAB_VALUE, title: t("fallbackTerminalTitle"), closable: true },
            ];
        const tabIds = new Set(baseTabs.map((tab) => tab.id));
        const tabs = [...baseTabs];
        for (const tabId of mountedTabs) {
          if (tabIds.has(tabId)) continue;
          tabs.push({
            id: tabId,
            title: t("fallbackTerminalTitle"),
            closable: true,
          });
          tabIds.add(tabId);
        }
        const isProject = isActiveContext
          ? currentView === "project"
          : (workspaceContexts[contextId] ?? false);
        const lastTab = readCenterStageLastTab(contextId);
        const contextOpenFiles = isActiveContext ? openFiles : getOpenFiles(contextId);
        const contextGithubTabs = isActiveContext
          ? githubTabs
          : (githubTabsByContext[contextId] ?? []);
        const contextBrowserTabs = isActiveContext
          ? browserTabs
          : (browserTabsByContext[contextId] ?? []);
        const validTabs = [
          ...tabs.map((tab) => tab.id),
          ...contextOpenFiles.map((f) => f.path),
          ...contextGithubTabs.map((tab) => tab.value),
          ...contextBrowserTabs.map((tab) => tab.value),
          "overview",
          "wiki",
          "project-wiki",
          "code-review",
          FIXED_TERMINAL_TAB_VALUE,
        ];
        const frameActiveTab = resolveFrameActiveTab({
          isActiveFrame: isActiveContext,
          urlOrEditorTab: isActiveContext ? activeValue : null,
          lastCenterTab: lastTab,
          fallbackTab: FIXED_TERMINAL_TAB_VALUE,
          validTabs,
        });

        return (
          <div
            key={contextId}
            data-workspace-frame={contextId}
            data-tier={isActiveContext ? "active" : "warm"}
            // HTML hidden for e2e/APP-043 contract; Tailwind hidden + contentVisibility for paint.
            hidden={!isActiveContext}
            className={cn(
              // Absolute stack: inactive frames stay mounted with live PTY sockets.
              // content-visibility skips layout/paint for warm frames; display still
              // uses hidden so xterm does not measure a zero grid when re-shown.
              "absolute inset-0 flex flex-col min-h-0 min-w-0",
              !isActiveContext && "hidden",
            )}
            style={
              !isActiveContext
                ? ({ contentVisibility: "hidden", containIntrinsicSize: "auto 800px" } as React.CSSProperties)
                : undefined
            }
          >
            {tabs
              .filter((tab) => {
                // Keep-alive candidates: already-mounted tabs + this frame's last
                // active terminal (covers the first paint after a context switch
                // before mountedTerminalTabsByContext is updated).
                const isRetained =
                  mountedTabs.includes(tab.id) || tab.id === frameActiveTab;
                if (!isRetained) return false;
                // Active frameActiveTab is never demounted (TECH §4.3 hard rule).
                if (isActiveContext && tab.id === frameActiveTab) return true;
                if (mountPlan.mounted.length === 0) {
                  // Bootstrap before plan: active secondaries + every frame's last tab.
                  return isActiveContext || tab.id === frameActiveTab;
                }
                // Warm frameActiveTab + all secondaries follow mountPlan (budgeted;
                // plan prioritizes warm last-tabs over active secondaries).
                return isKeyMounted(
                  mountPlan,
                  terminalMountKey(contextId, tab.id),
                );
              })
              .map((tab) => (
                <div
                  key={`${contextId}-${tab.id}`}
                  className={cn(
                    "flex-1 min-h-0 min-w-0",
                    !isFramePanelVisible({
                      isActiveFrame: isActiveContext,
                      frameActiveTab,
                      panelTabId: tab.id,
                    }) && "hidden",
                  )}
                >
                  <div className="h-full w-full">
                    <TerminalGrid
                      ref={
                        isActiveContext
                          ? tab.id === FIXED_TERMINAL_TAB_VALUE
                            ? terminalGridRef
                            : (instance) => {
                                if (terminalGridRefs.current) {
                                  terminalGridRefs.current[tab.id] = instance;
                                }
                              }
                          : undefined
                      }
                      workspaceId={contextId}
                      terminalTabId={tab.id === FIXED_TERMINAL_TAB_VALUE ? undefined : tab.id}
                      quickOpenAgents={isActiveContext ? terminalQuickOpenAgents : undefined}
                      className="h-full"
                      isProjectContext={isProject}
                      onNewTerminalTab={isActiveContext ? handleCreateTerminalCenterTab : undefined}
                      onTerminalPaneClosed={
                        isActiveContext ? handleTerminalPaneClosed : undefined
                      }
                    />
                  </div>
                </div>
              ))}

            {(isActiveContext ? projectWikiTabVisible : frameActiveTab === "project-wiki") &&
              (mountPlan.mounted.length === 0 ||
                isKeyMounted(mountPlan, namedTerminalMountKey(contextId, "project-wiki"))) && (
                <div
                  className={cn(
                    "flex-1 min-h-0 min-w-0",
                    !isFramePanelVisible({
                      isActiveFrame: isActiveContext,
                      frameActiveTab,
                      panelTabId: "project-wiki",
                    }) && "hidden",
                  )}
                >
                  <TerminalGrid
                    ref={isActiveContext ? projectWikiTerminalGridRef : undefined}
                    workspaceId={contextId}
                    scope="project-wiki"
                    toolbarActions={{ split: false, maximize: false, close: false }}
                    className="h-full"
                    onNewTerminalTab={isActiveContext ? handleCreateTerminalCenterTab : undefined}
                  />
                </div>
              )}

            {(isActiveContext ? codeReviewTabVisible : frameActiveTab === "code-review") &&
              (mountPlan.mounted.length === 0 ||
                isKeyMounted(mountPlan, namedTerminalMountKey(contextId, "code-review"))) && (
                <div
                  className={cn(
                    "flex-1 min-h-0 min-w-0",
                    !isFramePanelVisible({
                      isActiveFrame: isActiveContext,
                      frameActiveTab,
                      panelTabId: "code-review",
                    }) && "hidden",
                  )}
                >
                  <TerminalGrid
                    ref={isActiveContext ? codeReviewTerminalGridRef : undefined}
                    workspaceId={contextId}
                    scope="code-review"
                    toolbarActions={{ split: false, maximize: false, close: false }}
                    className="h-full"
                    onNewTerminalTab={isActiveContext ? handleCreateTerminalCenterTab : undefined}
                  />
                </div>
              )}

            {(mountPlan.mounted.length === 0 ||
              isKeyMounted(mountPlan, lightMountKey(contextId, "overview")) ||
              frameActiveTab === "overview") && (
              <div
                className={cn(
                  "flex-1 min-h-0 min-w-0 overflow-auto",
                  !isFramePanelVisible({
                    isActiveFrame: isActiveContext,
                    frameActiveTab,
                    panelTabId: "overview",
                  }) && "hidden",
                )}
              >
                <OverviewTab
                  contextId={contextId}
                  projectId={isActiveContext ? currentProject?.id : undefined}
                  projectName={isActiveContext ? currentProject?.name : undefined}
                  projectPath={isActiveContext ? currentProject?.mainFilePath : undefined}
                  workspaceName={
                    isActiveContext
                      ? (currentWorkspace?.displayName ?? currentWorkspace?.name)
                      : undefined
                  }
                  workspacePath={isActiveContext ? currentWorkspace?.localPath : undefined}
                  gitBranch={isActiveContext ? (currentBranch ?? undefined) : undefined}
                  createdAt={isActiveContext ? currentWorkspace?.createdAt : undefined}
                  isProjectOnly={isActiveContext ? !currentWorkspace : false}
                  githubIssue={isActiveContext ? currentWorkspace?.githubIssue : undefined}
                  priority={isActiveContext ? currentWorkspace?.priority : undefined}
                  workflowStatus={isActiveContext ? currentWorkspace?.workflowStatus : undefined}
                  labels={isActiveContext ? currentWorkspace?.labels : undefined}
                  active={
                    isActiveContext &&
                    isFramePanelVisible({
                      isActiveFrame: isActiveContext,
                      frameActiveTab,
                      panelTabId: "overview",
                    })
                  }
                />
              </div>
            )}

            {contextOpenFiles.map((file) => {
              if (
                mountPlan.mounted.length > 0 &&
                !isKeyMounted(mountPlan, editorMountKey(contextId, file.path))
              ) {
                // Always mount active file on active frame
                if (!(isActiveContext && activeValue === file.path)) {
                  return null;
                }
              }
              return (
                <TabsPanel
                  key={`${contextId}:${file.path}`}
                  value={file.path}
                  keepMounted
                  className={cn(
                    "flex-1 min-h-0 min-w-0",
                    !isFramePanelVisible({
                      isActiveFrame: isActiveContext,
                      frameActiveTab,
                      panelTabId: file.path,
                    }) && "hidden",
                  )}
                >
                  {isDiffGroupEditorPath(file.path) && currentRepoPath && isActiveContext ? (
                    <ChangesCodeView repoPath={currentRepoPath} groupPath={file.path} />
                  ) : isReviewGroupEditorPath(file.path) && isActiveContext ? (
                    <ReviewContextProvider
                      target={reviewTarget}
                      filePath=""
                      fileSnapshotGuid={null}
                      revisionGuid={getReviewGroupRevisionGuid(file.path)}
                    >
                      <ReviewCodeView groupPath={file.path} />
                    </ReviewContextProvider>
                  ) : file.path.startsWith(EDITOR_REVIEW_DIFF_PREFIX) &&
                    currentRepoPath &&
                    isActiveContext ? (
                    <ReviewContextProvider
                      target={reviewTarget}
                      filePath={getEditorSourcePath(file.path)}
                      fileSnapshotGuid={
                        file.path.slice(EDITOR_REVIEW_DIFF_PREFIX.length).split("/")[0] || null
                      }
                    >
                      <DiffViewer
                        repoPath={currentRepoPath}
                        filePath={getEditorSourcePath(file.path)}
                        originalPath={file.path}
                      />
                    </ReviewContextProvider>
                  ) : isConflictResolveEditorPath(file.path) && isActiveContext ? (
                    <GitConflictResolver />
                  ) : (
                    <FileViewer
                      file={file}
                      className="flex-1"
                      surfaceActive={
                        isActiveContext &&
                        isFramePanelVisible({
                          isActiveFrame: isActiveContext,
                          frameActiveTab,
                          panelTabId: file.path,
                        })
                      }
                    />
                  )}
                </TabsPanel>
              );
            })}

            {contextGithubTabs.map((tab) => {
              // M3/D12: GitHub is a light surface — only last-active / mountPlan keys stay mounted.
              const shouldMount =
                frameActiveTab === tab.value ||
                (mountPlan.mounted.length > 0 &&
                  isKeyMounted(mountPlan, lightMountKey(contextId, tab.value)));
              if (!shouldMount) return null;
              return (
                <div
                  key={`${contextId}-${tab.value}`}
                  className={cn(
                    "flex-1 min-h-0 min-w-0",
                    !isFramePanelVisible({
                      isActiveFrame: isActiveContext,
                      frameActiveTab,
                      panelTabId: tab.value,
                    }) && "hidden",
                  )}
                >
                  {tab.kind === "github-pr" ? (
                    <PRDetailView
                      active={
                        isActiveContext &&
                        isFramePanelVisible({
                          isActiveFrame: isActiveContext,
                          frameActiveTab,
                          panelTabId: tab.value,
                        })
                      }
                      branch={tab.branch}
                      onClosed={isActiveContext ? onGithubPullRequestChanged : undefined}
                      onMerged={isActiveContext ? onGithubPullRequestChanged : undefined}
                      onRequestClose={
                        isActiveContext
                          ? () => handleCloseGithubTab(tab.value)
                          : () => {}
                      }
                      owner={tab.owner}
                      prNumber={tab.prNumber}
                      repo={tab.repo}
                    />
                  ) : (
                    <ActionsDetailView
                      active={
                        isActiveContext &&
                        isFramePanelVisible({
                          isActiveFrame: isActiveContext,
                          frameActiveTab,
                          panelTabId: tab.value,
                        })
                      }
                      onRequestClose={
                        isActiveContext
                          ? () => handleCloseGithubTab(tab.value)
                          : () => {}
                      }
                      owner={tab.owner}
                      repo={tab.repo}
                      run={tab.run}
                      runId={tab.runId}
                    />
                  )}
                </div>
              );
            })}

            {contextBrowserTabs.map((tab) => {
              if (
                mountPlan.mounted.length > 0 &&
                !isKeyMounted(mountPlan, browserMountKey(contextId, tab.value)) &&
                !(isActiveContext && frameActiveTab === tab.value)
              ) {
                return null;
              }
              return (
                <div
                  key={`${contextId}-${tab.value}`}
                  className={cn(
                    "flex-1 min-h-0 min-w-0",
                    !isFramePanelVisible({
                      isActiveFrame: isActiveContext,
                      frameActiveTab,
                      panelTabId: tab.value,
                    }) && "hidden",
                  )}
                >
                  <BrowserPanel
                    workspaceId={
                      isActiveContext && currentView === "workspace"
                        ? (currentWorkspace?.id ?? null)
                        : null
                    }
                    projectId={isActiveContext ? currentProject?.id : undefined}
                    isActive={
                      isActiveContext &&
                      isFramePanelVisible({
                        isActiveFrame: isActiveContext,
                        frameActiveTab,
                        panelTabId: tab.value,
                      })
                    }
                    browserContextId={tab.browserContextId}
                    allowStandaloneWindow
                    allowMaximize
                    keepInactiveTabsMounted
                    syncUrlQueryParam={false}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
      </div>

      {/* Wiki stays host-active only (callbacks write URL); still paused when not activeValue */}
      {wikiCenterEligible && (
        <div
          className={cn(
            "flex-1 min-h-0 min-w-0 overflow-hidden",
            activeValue !== "wiki" && "hidden",
          )}
        >
          <WikiTab
            contextId={effectiveContextId}
            effectivePath={currentProject?.mainFilePath || ""}
            projectName={currentProject?.name}
            refreshTrigger={wikiRefreshTrigger}
            terminalGridRef={terminalGridRef}
            onSwitchToTerminal={() => setFixedTab("terminal")}
            onSwitchToProjectWikiAndRun={(run) => {
              projectWikiUserTriggeredRef.current = true;
              setProjectWikiPendingCommand(run);
              setProjectWikiVisibleMap((prev) => ({
                ...prev,
                [effectiveContextId]: true,
              }));
              setFixedTab("project-wiki");
            }}
            onProjectWikiReplaceAndRun={async (run) => {
              try {
                await systemApi.killProjectWikiWindow(effectiveContextId);
                projectWikiTerminalGridRef.current?.removeTerminalByTmuxWindowName(
                  PROJECT_WIKI_WINDOW_NAME,
                );
                projectWikiUserTriggeredRef.current = true;
                setProjectWikiPendingCommand(run);
                setProjectWikiVisibleMap((prev) => ({
                  ...prev,
                  [effectiveContextId]: true,
                }));
                setFixedTab("project-wiki");
                toastManager.add({
                  title: t("toasts.wikiGenerationStarted.title"),
                  description: t("toasts.wikiGenerationStarted.description"),
                  type: "info",
                });
              } catch (err) {
                setProjectWikiPendingCommand(null);
                toastManager.add({
                  title: t("errors.failedToClosePreviousTerminal"),
                  description: err instanceof Error ? err.message : t("errors.unknown"),
                  type: "error",
                });
              }
            }}
            wikiPage={wikiPageFromUrl ?? undefined}
            onWikiPageChange={setWikiPage}
            isWikiTabActive={activeValue === "wiki"}
          />
        </div>
      )}
    </>
  );
}
