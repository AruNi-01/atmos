"use client";

/**
 * Per-workspace center frame (APP-043 / IMP-011).
 *
 * Host maps many Active∪Warm frames; only this memoized leaf should re-render when
 * *its* paint/url/mount identity changes. Warm siblings skip React work on hops.
 */

import React from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "@workspace/ui";
import {
  ReviewContextProvider,
} from "@/features/diff/components/review/ReviewContextProvider";
import { OverviewTab } from "@/features/workspace/components/OverviewTab";
import {
  EDITOR_REVIEW_DIFF_PREFIX,
  getEditorSourcePath,
  getReviewGroupRevisionGuid,
  isConflictResolveEditorPath,
  isConflictResolveReadOnlyPath,
  isReviewGroupEditorPath,
  useEditorStore,
} from "@/features/editor/store/use-editor-store";
import {
  FIXED_TERMINAL_TAB_VALUE,
  type TerminalCenterTab,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import { isDiffGroupEditorPath } from "@/features/diff/lib/diff-editor-paths";
import { useGithubCenterTabsStore } from "@/features/github/store/use-github-center-tabs";
import { useBrowserCenterTabsStore } from "@/features/browser/store/use-browser-center-tabs";
import {
  browserMountKey,
  editorMountKey,
  isFramePanelVisible,
  isKeyMounted,
  lightMountKey,
  browserKeepAlivePanelClass,
  githubKeepAlivePanelClass,
  lightSurfacePanelClass,
  namedTerminalMountKey,
  resolveFrameActiveTab,
  terminalKeepAlivePanelClass,
  terminalMountKey,
} from "@/app-shell/workspace-surface-policies";
import { DiscardableHeavySurface } from "@/app-shell/discardable-github-surface";
import { GithubKeptSurface } from "@/app-shell/keep-alive-center-views";
import { readCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";
import { CENTER_STAGE_RADIUS_CSS } from "@/app-shell/sidebar-layout-constants";
import { paneHiddenByCenterFullscreen } from "@/app-shell/center-stage-fullscreen";
import {
  isUsablePaneSlotBox,
  shouldWithholdUnmeasuredPaneTerminal,
} from "@/app-shell/center-pane/use-center-pane-slot-boxes";
import { cn } from "@/shared/lib/utils";
import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";
import {
  workspaceCenterFramePropsAreEqual,
  type TerminalQuickOpenAgent,
  type WorkspaceCenterFrameProps,
} from "@/app-shell/workspace-center-frame-equality";

export type { TerminalQuickOpenAgent, WorkspaceCenterFrameProps };
export { workspaceCenterFramePropsAreEqual };

function TerminalGridLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

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
    import("@/features/browser/components/BrowserPanel").then(
      (mod) => mod.BrowserPanel,
    ),
  { ssr: false },
);
const SimulatorPanel = dynamic(
  () =>
    import("@/features/simulator").then((mod) => mod.SimulatorPanel),
  { ssr: false },
);
const GitHistoryPanel = dynamic(
  () =>
    import("@/features/git/components/GitHistoryPanel").then((mod) => mod.GitHistoryPanel),
  { ssr: false },
);
const ChangesPanel = dynamic(
  () =>
    import("@/features/git/components/ChangesPanel").then((mod) => mod.ChangesPanel),
  { ssr: false },
);
const ReviewCenterPanel = dynamic(
  () =>
    import("@/features/diff/components/ReviewCenterPanel").then(
      (mod) => mod.ReviewCenterPanel,
    ),
  { ssr: false },
);
const GithubHubPanel = dynamic(
  () =>
    import("@/features/github/components/GithubHubPanel").then(
      (mod) => mod.GithubHubPanel,
    ),
  { ssr: false },
);
const PtDesignCenterPanel = dynamic(
  () =>
    import("@/features/pt-design/PtDesignCenterPanel").then(
      (mod) => mod.PtDesignCenterPanel,
    ),
  { ssr: false },
);
const RunScript = dynamic(
  () =>
    import("@/features/browser/components/RunScript").then((mod) => mod.RunScript),
  { ssr: false },
);
const FileTreePanel = dynamic(
  () =>
    import("@/features/files/components/FileTreePanel").then((mod) => mod.FileTreePanel),
  { ssr: false },
);

const KeptChangesCodeView = React.memo(ChangesCodeView);
const KeptDiffViewer = React.memo(DiffViewer);
const KeptReviewCodeView = React.memo(ReviewCodeView);
const KeptGitConflictResolver = React.memo(GitConflictResolver);
const KeptFileViewer = React.memo(FileViewer);
const KeptOverviewTab = React.memo(OverviewTab);
const KeptSimulatorPanel = React.memo(SimulatorPanel);
const KeptGitHistoryPanel = React.memo(GitHistoryPanel);
const KeptChangesPanel = React.memo(ChangesPanel);
const KeptReviewCenterPanel = React.memo(ReviewCenterPanel);
const KeptGithubHubPanel = React.memo(GithubHubPanel);
const KeptPtDesignCenterPanel = React.memo(PtDesignCenterPanel);
const KeptRunScript = React.memo(RunScript);
const KeptFileTreePanel = React.memo(FileTreePanel);

export const EMPTY_MOUNTED_TAB_IDS: string[] = [];

function multiPanePanelStyleForPane(
  visible: boolean,
  paneId: string | undefined,
  paneSlotBoxes: Readonly<Record<string, { top: number; left: number; width: number; height: number }>> | null | undefined,
  fullscreenPaneId?: string | null,
): React.CSSProperties | undefined {
  if (!visible || !paneId || !paneSlotBoxes) return undefined;
  if (paneHiddenByCenterFullscreen(fullscreenPaneId, paneId)) {
    return {
      position: "absolute",
      top: 0,
      right: "auto",
      bottom: "auto",
      left: 0,
      width: 0,
      height: 0,
      overflow: "hidden",
      pointerEvents: "none",
      opacity: 0,
    };
  }
  const box = paneSlotBoxes[paneId];
  // Missing box = empty pane just grew a slot. Do not fall back to
  // `inset: 0` (covers sibling panes and fits the PTY at the wrong size).
  if (!isUsablePaneSlotBox(box)) {
    return {
      position: "absolute",
      top: 0,
      right: "auto",
      bottom: "auto",
      left: 0,
      width: 0,
      height: 0,
      overflow: "hidden",
      pointerEvents: "none",
      opacity: 0,
    };
  }
  return {
    position: "absolute",
    top: box.top,
    right: "auto",
    bottom: "auto",
    left: box.left,
    width: box.width,
    height: box.height,
    zIndex: 1,
    // Round the overlay so square canvases don't cover the pane card corners.
    // Leave overflow to the panel class: inline `hidden` would override
    // Overview's `overflow-auto`. Terminals clip via `.atmos-terminal-panel-*`.
    borderBottomLeftRadius: CENTER_STAGE_RADIUS_CSS,
    borderBottomRightRadius: CENTER_STAGE_RADIUS_CSS,
  };
}

function hostPaneIdsForTab(
  tabId: string,
  tabHostPaneIds: Readonly<Record<string, readonly string[]>> | null | undefined,
  tabToPaneId: Readonly<Record<string, string>> | null | undefined,
): Array<string | undefined> {
  const hosts = tabHostPaneIds?.[tabId];
  if (hosts && hosts.length > 0) return [...hosts];
  const owner = tabToPaneId?.[tabId];
  if (owner) return [owner];
  if (tabHostPaneIds || tabToPaneId) return [];
  return [undefined];
}

function WorkspaceCenterFrameImpl({
  contextId,
  isActiveContext,
  isUrlSyncedActive,
  mountPlan,
  mountedTabIds,
  fallbackTerminalTitle,
  activeValue,
  activeTabIds,
  tabToPaneId,
  tabHostPaneIds,
  paneActiveTabById,
  paneSlotBoxes,
  fullscreenPaneId,
  visibleTerminalTabs,
  openFiles,
  githubTabs,
  browserTabs,
  currentView,
  currentProject,
  currentWorkspace,
  currentBranch,
  currentRepoPath,
  reviewTarget,
  projectWikiTabVisible,
  codeReviewTabVisible,
  simulatorTabVisible,
  gitHistoryTabVisible,
  changesTabVisible,
  reviewTabVisible,
  runTabVisible,
  githubHubTabVisible,
  filesTabVisible,
  ptDesignTabVisible,
  terminalQuickOpenAgents,
  terminalGridRef,
  terminalGridRefs,
  projectWikiTerminalGridRef,
  codeReviewTerminalGridRef,
  handleCreateTerminalCenterTab,
  handleTerminalPaneClosed,
  handleCloseGithubTab,
  onGithubPullRequestChanged,
}: WorkspaceCenterFrameProps) {
  // Warm path: read identity stores locally so host churn does not rebuild props.
  const storeTerminalTabs = useTerminalStore((s) => s.workspaceTerminalTabs[contextId]);
  const isProjectContext = useTerminalStore((s) => s.workspaceContexts[contextId] ?? false);
  // Prefer stable openFiles array refs from workspaceStates (not getOpenFiles wrapper).
  const storeOpenFiles = useEditorStore(
    (s) => s.workspaceStates[contextId]?.openFiles,
  );
  const storeGithubTabs = useGithubCenterTabsStore(
    (s) => s.tabsByContext[contextId],
  );
  const storeBrowserTabs = useBrowserCenterTabsStore(
    (s) => s.tabsByContext[contextId],
  );

  const baseTabs = isUrlSyncedActive
    ? (visibleTerminalTabs ?? [
        { id: FIXED_TERMINAL_TAB_VALUE, title: fallbackTerminalTitle, closable: true },
      ])
    : storeTerminalTabs ?? [
        { id: FIXED_TERMINAL_TAB_VALUE, title: fallbackTerminalTitle, closable: true },
      ];

  const tabIds = new Set(baseTabs.map((tab) => tab.id));
  const tabs: TerminalCenterTab[] = [...baseTabs];
  for (const tabId of mountedTabIds) {
    if (tabIds.has(tabId)) continue;
    tabs.push({
      id: tabId,
      title: fallbackTerminalTitle,
      closable: true,
    });
    tabIds.add(tabId);
  }

  const isProject = isUrlSyncedActive
    ? currentView === "project"
    : isProjectContext;
  const lastTab = readCenterStageLastTab(contextId);
  const contextOpenFiles = isUrlSyncedActive
    ? (openFiles ?? [])
    : (storeOpenFiles ?? []);
  const contextGithubTabs = isUrlSyncedActive
    ? (githubTabs ?? [])
    : (storeGithubTabs ?? []);
  const contextBrowserTabs = isUrlSyncedActive
    ? (browserTabs ?? [])
    : (storeBrowserTabs ?? []);

  const validTabs = [
    ...tabs.map((tab) => tab.id),
    ...contextOpenFiles.map((f) => f.path),
    ...contextGithubTabs.map((tab) => tab.value),
    ...contextBrowserTabs.map((tab) => tab.value),
    "overview",
    "wiki",
    "project-wiki",
    "code-review",
    "simulator",
    "git-history",
    "changes",
    "review",
    "run",
    "github",
    "files",
    "pt-design",
    FIXED_TERMINAL_TAB_VALUE,
  ];
  const frameActiveTab = resolveFrameActiveTab({
    isActiveFrame: isActiveContext,
    urlOrEditorTab: isUrlSyncedActive ? activeValue : null,
    lastCenterTab: lastTab,
    fallbackTab: FIXED_TERMINAL_TAB_VALUE,
    validTabs,
  });

  // Multi-pane: keep every pane-active surface visible/mounted, including warm
  // frames. Slot geometry is only applied when this frame is URL-synced so
  // active-context boxes cannot paint a warm workspace incorrectly.
  const multiActiveTabIds =
    activeTabIds && activeTabIds.length > 0 ? activeTabIds : null;

  const retainSurface = (tabId: string, urlVisible: boolean) => {
    if (isUrlSyncedActive) return urlVisible;
    if (multiActiveTabIds?.includes(tabId)) return true;
    return frameActiveTab === tabId;
  };

  const paneOwner = (tabId: string) => tabToPaneId?.[tabId];
  const interactivePaneClass = (visible: boolean) =>
    multiActiveTabIds && visible && isActiveContext ? "pointer-events-auto" : undefined;

  const panelVisible = React.useCallback(
    (panelTabId: string, paneId?: string) => {
      if (paneId && paneActiveTabById) {
        return paneActiveTabById[paneId] === panelTabId;
      }
      return isFramePanelVisible({
        isActiveFrame: isActiveContext,
        frameActiveTab,
        frameActiveTabIds: multiActiveTabIds,
        panelTabId,
      });
    },
    [frameActiveTab, isActiveContext, multiActiveTabIds, paneActiveTabById],
  );

  const panelStyle = React.useCallback(
    (panelTabId: string, visible: boolean, paneId?: string) =>
      multiActiveTabIds
        ? multiPanePanelStyleForPane(
            visible,
            paneId ?? tabToPaneId?.[panelTabId],
            paneSlotBoxes,
            fullscreenPaneId,
          )
        : undefined,
    [fullscreenPaneId, multiActiveTabIds, paneSlotBoxes, tabToPaneId],
  );

  const hostedPaneIds = (tabId: string) =>
    hostPaneIdsForTab(tabId, tabHostPaneIds, tabToPaneId);

  const planReady = mountPlan.mounted.length > 0;
  const keptGithubTabValuesRef = React.useRef<Set<string>>(new Set());
  {
    const openGithubTabValues = new Set(
      contextGithubTabs.map((tab) => tab.value),
    );
    for (const value of [...keptGithubTabValuesRef.current]) {
      if (!openGithubTabValues.has(value)) {
        keptGithubTabValuesRef.current.delete(value);
      }
    }
  }

  return (
    <div
      data-workspace-frame={contextId}
      data-tier={isActiveContext ? "active" : "warm"}
      data-url-synced={isUrlSyncedActive ? "true" : "false"}
      // Outer shell is the only Active/Warm paint gate (IMP-010).
      // Use data-tier opacity stacking (globals.css) — never display:none /
      // content-visibility:hidden / visibility:hidden, which blank warm xterm WebGL on hop.
      aria-hidden={!isActiveContext}
      inert={!isActiveContext ? true : undefined}
      className={cn(
        "absolute inset-0 flex min-h-0 min-w-0 flex-col",
        multiActiveTabIds && "pointer-events-none",
      )}
    >
      {tabs
        .filter((tab) => {
          const isMultiActive = Boolean(multiActiveTabIds?.includes(tab.id));
          const isRetained =
            mountedTabIds.includes(tab.id) ||
            tab.id === frameActiveTab ||
            isMultiActive;
          if (!isRetained) return false;
          if (
            shouldWithholdUnmeasuredPaneTerminal({
              applySlotGeometry: isUrlSyncedActive,
              isPaneActive: isMultiActive,
              slotBox: paneSlotBoxes?.[tabToPaneId?.[tab.id] ?? ""],
            })
          ) {
            return false;
          }
          if (isActiveContext && (tab.id === frameActiveTab || isMultiActive)) return true;
          if (!planReady) {
            return isActiveContext || tab.id === frameActiveTab || isMultiActive;
          }
          return isKeyMounted(mountPlan, terminalMountKey(contextId, tab.id));
        })
        .map((tab) => (
          <div
            key={`${contextId}-${tab.id}`}
            data-center-pane-owner={paneOwner(tab.id)}
            className={cn(
              terminalKeepAlivePanelClass(panelVisible(tab.id)),
              interactivePaneClass(panelVisible(tab.id)),
            )}
            style={panelStyle(tab.id, panelVisible(tab.id))}
          >
            <div className="h-full w-full">
              <TerminalGrid
                ref={
                  isUrlSyncedActive
                    ? tab.id === FIXED_TERMINAL_TAB_VALUE
                      ? terminalGridRef
                      : (instance) => {
                          if (terminalGridRefs?.current) {
                            terminalGridRefs.current[tab.id] = instance;
                          }
                        }
                    : undefined
                }
                workspaceId={contextId}
                terminalTabId={tab.id === FIXED_TERMINAL_TAB_VALUE ? undefined : tab.id}
                quickOpenAgents={isUrlSyncedActive ? terminalQuickOpenAgents : undefined}
                className="h-full"
                isProjectContext={isProject}
                // Only the active frame + this tab should fit/measure (IMP-014).
                isSurfaceActive={
                  isActiveContext &&
                  panelVisible(tab.id)
                }
                onNewTerminalTab={
                  isUrlSyncedActive ? handleCreateTerminalCenterTab : undefined
                }
                onTerminalPaneClosed={
                  isUrlSyncedActive ? handleTerminalPaneClosed : undefined
                }
              />
            </div>
          </div>
        ))}

      {retainSurface("project-wiki", projectWikiTabVisible) &&
        (!planReady ||
          isKeyMounted(mountPlan, namedTerminalMountKey(contextId, "project-wiki")) ||
          frameActiveTab === "project-wiki" ||
          Boolean(multiActiveTabIds?.includes("project-wiki"))) && (
          <div
            data-center-pane-owner={paneOwner("project-wiki")}
            className={cn(terminalKeepAlivePanelClass(panelVisible("project-wiki")), interactivePaneClass(panelVisible("project-wiki")))}
            style={panelStyle("project-wiki", panelVisible("project-wiki"))}
          >
            <TerminalGrid
              ref={isUrlSyncedActive ? projectWikiTerminalGridRef : undefined}
              workspaceId={contextId}
              scope="project-wiki"
              toolbarActions={{ split: false, maximize: false, close: false }}
              className="h-full"
              isSurfaceActive={
                isActiveContext &&
                panelVisible("project-wiki")
              }
              onNewTerminalTab={
                isUrlSyncedActive ? handleCreateTerminalCenterTab : undefined
              }
            />
          </div>
        )}

      {retainSurface("code-review", codeReviewTabVisible) &&
        (!planReady ||
          isKeyMounted(mountPlan, namedTerminalMountKey(contextId, "code-review")) ||
          frameActiveTab === "code-review" ||
          Boolean(multiActiveTabIds?.includes("code-review"))) && (
          <div
            data-center-pane-owner={paneOwner("code-review")}
            className={cn(terminalKeepAlivePanelClass(panelVisible("code-review")), interactivePaneClass(panelVisible("code-review")))}
            style={panelStyle("code-review", panelVisible("code-review"))}
          >
            <TerminalGrid
              ref={isUrlSyncedActive ? codeReviewTerminalGridRef : undefined}
              workspaceId={contextId}
              scope="code-review"
              toolbarActions={{ split: false, maximize: false, close: false }}
              className="h-full"
              isSurfaceActive={
                isActiveContext &&
                panelVisible("code-review")
              }
              onNewTerminalTab={
                isUrlSyncedActive ? handleCreateTerminalCenterTab : undefined
              }
            />
          </div>
        )}

      {(frameActiveTab === "overview" ||
        Boolean(multiActiveTabIds?.includes("overview")) ||
        (isUrlSyncedActive &&
          (!planReady ||
            isKeyMounted(mountPlan, lightMountKey(contextId, "overview"))))) &&
        hostedPaneIds("overview").map((paneId) => {
          const visible = panelVisible("overview", paneId);
          return (
        <div
          key={`${contextId}-overview-${paneId ?? "root"}`}
          data-center-pane-owner={paneId ?? paneOwner("overview")}
          aria-hidden={!visible}
          inert={!visible ? true : undefined}
          className={cn(lightSurfacePanelClass(visible), interactivePaneClass(visible))}
          style={panelStyle("overview", visible, paneId)}
        >
          <KeptOverviewTab
            contextId={hostIdFromCenterKey(contextId)}
            editorContextId={contextId}
            projectId={isUrlSyncedActive ? currentProject?.id : undefined}
            projectName={isUrlSyncedActive ? currentProject?.name : undefined}
            projectPath={isUrlSyncedActive ? currentProject?.mainFilePath : undefined}
            workspaceName={
              isUrlSyncedActive
                ? (currentWorkspace?.displayName ?? currentWorkspace?.name)
                : undefined
            }
            workspacePath={isUrlSyncedActive ? currentWorkspace?.localPath : undefined}
            gitBranch={isUrlSyncedActive ? (currentBranch ?? undefined) : undefined}
            createdAt={isUrlSyncedActive ? currentWorkspace?.createdAt : undefined}
            isProjectOnly={isUrlSyncedActive ? !currentWorkspace : false}
            githubIssue={isUrlSyncedActive ? currentWorkspace?.githubIssue : undefined}
            priority={isUrlSyncedActive ? currentWorkspace?.priority : undefined}
            workflowStatus={isUrlSyncedActive ? currentWorkspace?.workflowStatus : undefined}
            labels={isUrlSyncedActive ? currentWorkspace?.labels : undefined}
            active={isActiveContext}
          />
        </div>
          );
        })}

      {contextOpenFiles.map((file) => {
        if (planReady && !isKeyMounted(mountPlan, editorMountKey(contextId, file.path))) {
          if (!(isUrlSyncedActive && activeValue === file.path)) {
            if (
              !(
                isActiveContext &&
                (frameActiveTab === file.path || multiActiveTabIds?.includes(file.path))
              )
            ) {
              return null;
            }
          }
        }
        // Not TabsPanel: mosaic hosts this outside <Tabs.Root> (Base UI #64).
        return hostedPaneIds(file.path).map((paneId) => {
          const visible = panelVisible(file.path, paneId);
          return (
          <div
            key={`${contextId}:${file.path}:${paneId ?? "root"}`}
            data-center-pane-owner={paneId ?? paneOwner(file.path)}
            aria-hidden={!visible}
            inert={!visible ? true : undefined}
            className={cn(lightSurfacePanelClass(visible), interactivePaneClass(visible))}
            style={panelStyle(file.path, visible, paneId)}
          >
            {isDiffGroupEditorPath(file.path) && currentRepoPath && isUrlSyncedActive ? (
              <KeptChangesCodeView
                repoPath={currentRepoPath}
                groupPath={file.path}
                contextId={contextId}
              />
            ) : isReviewGroupEditorPath(file.path) && isUrlSyncedActive ? (
              <ReviewContextProvider
                target={reviewTarget ?? null}
                filePath=""
                fileSnapshotGuid={null}
                revisionGuid={getReviewGroupRevisionGuid(file.path)}
              >
                <KeptReviewCodeView groupPath={file.path} contextId={contextId} />
              </ReviewContextProvider>
            ) : file.path.startsWith(EDITOR_REVIEW_DIFF_PREFIX) &&
              currentRepoPath &&
              isUrlSyncedActive ? (
              <ReviewContextProvider
                target={reviewTarget ?? null}
                filePath={getEditorSourcePath(file.path)}
                fileSnapshotGuid={
                  file.path.slice(EDITOR_REVIEW_DIFF_PREFIX.length).split("/")[0] || null
                }
              >
                <KeptDiffViewer
                  repoPath={currentRepoPath}
                  filePath={getEditorSourcePath(file.path)}
                  originalPath={file.path}
                  contextId={contextId}
                />
              </ReviewContextProvider>
            ) : isConflictResolveEditorPath(file.path) && isUrlSyncedActive ? (
              <KeptGitConflictResolver
                readOnly={isConflictResolveReadOnlyPath(file.path)}
                focusPath={getEditorSourcePath(file.path)}
                editorPath={file.path}
              />
            ) : (
              <KeptFileViewer
                file={file}
                className="flex-1"
                contextId={contextId}
                surfaceActive={isActiveContext}
              />
            )}
          </div>
          );
        });
      })}

      {contextGithubTabs.map((tab) => {
        const hosts = hostedPaneIds(tab.value);
        const githubVisible = hosts.some((paneId) => panelVisible(tab.value, paneId));
        if (githubVisible) keptGithubTabValuesRef.current.add(tab.value);
        const shouldMount =
          githubVisible || keptGithubTabValuesRef.current.has(tab.value);
        if (!shouldMount) return null;
        return hosts.map((paneId) => {
          const paneVisible = panelVisible(tab.value, paneId);
          return (
          <div
            key={`${contextId}-${tab.value}-${paneId ?? "root"}`}
            data-center-pane-owner={paneId ?? paneOwner(tab.value)}
            aria-hidden={!paneVisible}
            inert={!paneVisible ? true : undefined}
            className={cn(githubKeepAlivePanelClass(paneVisible), interactivePaneClass(paneVisible))}
          style={panelStyle(tab.value, paneVisible, paneId)}
          >
            <DiscardableHeavySurface active={isActiveContext && paneVisible}>
            <GithubKeptSurface
              tab={tab}
              active={isActiveContext}
              onPullRequestChanged={
                isUrlSyncedActive ? onGithubPullRequestChanged : undefined
              }
              onCloseTab={isUrlSyncedActive ? handleCloseGithubTab : undefined}
            />
            </DiscardableHeavySurface>
          </div>
          );
        });
      })}

      {contextBrowserTabs.map((tab) => {
        if (
          planReady &&
          !isKeyMounted(mountPlan, browserMountKey(contextId, tab.value)) &&
          !(isActiveContext && (frameActiveTab === tab.value || multiActiveTabIds?.includes(tab.value)))
        ) {
          return null;
        }
        const browserVisible = panelVisible(tab.value);
        return (
          <div
            key={`${contextId}-${tab.value}`}
            data-center-pane-owner={paneOwner(tab.value)}
            aria-hidden={!browserVisible}
            inert={!browserVisible ? true : undefined}
            className={cn(browserKeepAlivePanelClass(browserVisible), interactivePaneClass(browserVisible))}
            style={panelStyle(tab.value, browserVisible)}
          >
            <BrowserPanel
              workspaceId={
                isUrlSyncedActive && currentView === "workspace"
                  ? (currentWorkspace?.id ?? null)
                  : null
              }
              projectId={isUrlSyncedActive ? currentProject?.id : undefined}
              isActive={isActiveContext && browserVisible}
              browserContextId={tab.browserContextId}
              allowStandaloneWindow
              allowMaximize
              keepInactiveTabsMounted
              syncUrlQueryParam={false}
              centerPaneOwnerId={paneOwner(tab.value)}
            />
          </div>
        );
      })}

      {retainSurface("simulator", simulatorTabVisible) &&
        hostedPaneIds("simulator").map((paneId) => {
          const visible = panelVisible("simulator", paneId);
          return (
        <div
          key={`${contextId}-simulator-${paneId ?? "root"}`}
          data-center-pane-owner={paneId ?? paneOwner("simulator")}
          aria-hidden={!visible}
          inert={!visible ? true : undefined}
          className={cn(lightSurfacePanelClass(visible), interactivePaneClass(visible))}
          style={panelStyle("simulator", visible, paneId)}
        >
          <DiscardableHeavySurface active={isActiveContext && visible}>
          <KeptSimulatorPanel
            workspaceId={
              isUrlSyncedActive && currentView === "workspace"
                ? (currentWorkspace?.id ?? contextId)
                : contextId
            }
            active={isActiveContext}
          />
          </DiscardableHeavySurface>
        </div>
          );
        })}

      {retainSurface("git-history", gitHistoryTabVisible) &&
        hostedPaneIds("git-history").map((paneId) => {
          const visible = panelVisible("git-history", paneId);
          return (
        <div
          key={`${contextId}-git-history-${paneId ?? "root"}`}
          data-center-pane-owner={paneId ?? paneOwner("git-history")}
          aria-hidden={!visible}
          inert={!visible ? true : undefined}
          className={cn(lightSurfacePanelClass(visible), interactivePaneClass(visible))}
          style={panelStyle("git-history", visible, paneId)}
        >
          <DiscardableHeavySurface active={isActiveContext && visible}>
          <KeptGitHistoryPanel
            contextId={contextId}
            repoPath={isUrlSyncedActive ? (currentRepoPath ?? null) : null}
          />
          </DiscardableHeavySurface>
        </div>
          );
        })}

      {retainSurface("changes", changesTabVisible) &&
        hostedPaneIds("changes").map((paneId) => {
          const visible = panelVisible("changes", paneId);
          return (
        <div
          key={`${contextId}-changes-${paneId ?? "root"}`}
          data-center-pane-owner={paneId ?? paneOwner("changes")}
          aria-hidden={!visible}
          inert={!visible ? true : undefined}
          className={cn(lightSurfacePanelClass(visible), interactivePaneClass(visible))}
          style={panelStyle("changes", visible, paneId)}
        >
          <DiscardableHeavySurface active={isActiveContext && visible}>
          <KeptChangesPanel
            contextId={contextId}
            currentProject={isUrlSyncedActive ? currentProject : undefined}
            currentProjectPath={isUrlSyncedActive ? (currentRepoPath ?? null) : null}
            currentWorkspace={isUrlSyncedActive ? currentWorkspace : undefined}
            projectId={isUrlSyncedActive ? (currentProject?.id ?? null) : null}
            workspaceId={
              isUrlSyncedActive && currentView === "workspace"
                ? (currentWorkspace?.id ?? null)
                : null
            }
          />
          </DiscardableHeavySurface>
        </div>
          );
        })}

      {retainSurface("review", reviewTabVisible) &&
        hostedPaneIds("review").map((paneId) => {
          const visible = panelVisible("review", paneId);
          return (
        <div
          key={`${contextId}-review-${paneId ?? "root"}`}
          data-center-pane-owner={paneId ?? paneOwner("review")}
          aria-hidden={!visible}
          inert={!visible ? true : undefined}
          className={cn(lightSurfacePanelClass(visible), interactivePaneClass(visible))}
          style={panelStyle("review", visible, paneId)}
        >
          <DiscardableHeavySurface active={isActiveContext && visible}>
          <KeptReviewCenterPanel
            filePath=""
            contextId={contextId}
            reviewTarget={isUrlSyncedActive ? (reviewTarget ?? null) : null}
          />
          </DiscardableHeavySurface>
        </div>
          );
        })}

      {retainSurface("run", runTabVisible) &&
        hostedPaneIds("run").map((paneId) => {
          const visible = panelVisible("run", paneId);
          return (
        <div
          key={`${contextId}-run-${paneId ?? "root"}`}
          data-center-pane-owner={paneId ?? paneOwner("run")}
          aria-hidden={!visible}
          inert={!visible ? true : undefined}
          className={cn(lightSurfacePanelClass(visible), interactivePaneClass(visible))}
          style={panelStyle("run", visible, paneId)}
        >
          <DiscardableHeavySurface active={isActiveContext && visible}>
          <KeptRunScript
            workspaceId={isUrlSyncedActive ? contextId : null}
            projectId={isUrlSyncedActive ? currentProject?.id : undefined}
            isActive={isActiveContext}
            projectName={isUrlSyncedActive ? currentProject?.name : undefined}
            workspaceName={isUrlSyncedActive ? currentWorkspace?.name : undefined}
          />
          </DiscardableHeavySurface>
        </div>
          );
        })}

      {retainSurface("github", githubHubTabVisible) &&
        hostedPaneIds("github").map((paneId) => {
          const visible = panelVisible("github", paneId);
          return (
        <div
          key={`${contextId}-github-${paneId ?? "root"}`}
          data-center-pane-owner={paneId ?? paneOwner("github")}
          aria-hidden={!visible}
          inert={!visible ? true : undefined}
          className={cn(lightSurfacePanelClass(visible), interactivePaneClass(visible))}
          style={panelStyle("github", visible, paneId)}
        >
          <DiscardableHeavySurface active={isActiveContext && visible}>
          <KeptGithubHubPanel
            currentProjectPath={isUrlSyncedActive ? (currentRepoPath ?? null) : null}
          />
          </DiscardableHeavySurface>
        </div>
          );
        })}

      {retainSurface("files", filesTabVisible) &&
        hostedPaneIds("files").map((paneId) => {
          const visible = panelVisible("files", paneId);
          return (
        <div
          key={`${contextId}-files-${paneId ?? "root"}`}
          data-center-pane-owner={paneId ?? paneOwner("files")}
          aria-hidden={!visible}
          inert={!visible ? true : undefined}
          className={cn(lightSurfacePanelClass(visible), interactivePaneClass(visible))}
          style={panelStyle("files", visible, paneId)}
        >
          <DiscardableHeavySurface active={isActiveContext && visible}>
          <KeptFileTreePanel
            projectName={isUrlSyncedActive ? currentProject?.name : undefined}
            rootPath={
              isUrlSyncedActive
                ? (currentWorkspace?.localPath ?? currentProject?.mainFilePath ?? null)
                : undefined
            }
            currentProjectPath={
              isUrlSyncedActive ? (currentRepoPath ?? currentWorkspace?.localPath ?? null) : null
            }
            contextId={contextId}
            revealEnabled={isActiveContext}
          />
          </DiscardableHeavySurface>
        </div>
          );
        })}

      {retainSurface("pt-design", ptDesignTabVisible) &&
        hostedPaneIds("pt-design").map((paneId) => {
          const visible = panelVisible("pt-design", paneId);
          return (
        <div
          key={`${contextId}-pt-design-${paneId ?? "root"}`}
          data-center-pane-owner={paneId ?? paneOwner("pt-design")}
          aria-hidden={!visible}
          inert={!visible ? true : undefined}
          className={cn(lightSurfacePanelClass(visible), interactivePaneClass(visible))}
          style={panelStyle("pt-design", visible, paneId)}
        >
          <DiscardableHeavySurface active={isActiveContext && visible}>
          <KeptPtDesignCenterPanel contextId={contextId} />
          </DiscardableHeavySurface>
        </div>
          );
        })}
    </div>
  );
}

export const WorkspaceCenterFrame = React.memo(
  WorkspaceCenterFrameImpl,
  workspaceCenterFramePropsAreEqual,
);
WorkspaceCenterFrame.displayName = "WorkspaceCenterFrame";
