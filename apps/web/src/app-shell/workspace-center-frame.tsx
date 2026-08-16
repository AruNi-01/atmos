"use client";

/**
 * Per-workspace center frame (APP-043 / IMP-011).
 *
 * Host maps many Active∪Warm frames; only this memoized leaf should re-render when
 * *its* paint/url/mount identity changes. Warm siblings skip React work on hops.
 */

import React from "react";
import dynamic from "next/dynamic";
import { Loader2, TabsPanel } from "@workspace/ui";
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
  lightSurfacePanelClass,
  namedTerminalMountKey,
  resolveFrameActiveTab,
  terminalKeepAlivePanelClass,
  terminalMountKey,
} from "@/app-shell/workspace-surface-policies";
import { readCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";
import { cn } from "@/shared/lib/utils";
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
const PRDetailView = dynamic(
  () =>
    import("@/features/github/components/PRDetailView").then((mod) => mod.PRDetailView),
  { ssr: false },
);
const IssueDetailView = dynamic(
  () =>
    import("@/features/github/components/IssueDetailView").then(
      (mod) => mod.IssueDetailView,
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
const CommitDetailView = dynamic(
  () =>
    import("@/features/github/components/CommitDetailView").then(
      (mod) => mod.CommitDetailView,
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

export const EMPTY_MOUNTED_TAB_IDS: string[] = [];

function multiPanePanelStyle(
  visible: boolean,
  tabId: string,
  tabToPaneId: Readonly<Record<string, string>> | null | undefined,
  paneSlotBoxes: Readonly<Record<string, { top: number; left: number; width: number; height: number }>> | null | undefined,
): React.CSSProperties | undefined {
  if (!visible || !tabToPaneId || !paneSlotBoxes) return undefined;
  const paneId = tabToPaneId[tabId];
  if (!paneId) return undefined;
  const box = paneSlotBoxes[paneId];
  if (!box || box.width <= 0 || box.height <= 0) return undefined;
  return {
    position: "absolute",
    inset: "auto",
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
    zIndex: 1,
    // Multi-pane panels sit in a host sibling of the rounded pane card, so
    // they are not clipped by the card. Round the bottom so square terminal
    // canvas does not cover the pane's rounded-xl corners.
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: "hidden",
  };
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
  paneSlotBoxes,
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

  // Multi-pane: position into slots whenever we have pane geometry (even one
  // active tab + empty launcher panes). length > 0 is enough.
  const multiActiveTabIds =
    isUrlSyncedActive && activeTabIds && activeTabIds.length > 0 && tabToPaneId
      ? activeTabIds
      : null;

  const panelVisible = React.useCallback(
    (panelTabId: string) =>
      isFramePanelVisible({
        isActiveFrame: isActiveContext,
        frameActiveTab,
        frameActiveTabIds: multiActiveTabIds,
        panelTabId,
      }),
    [frameActiveTab, isActiveContext, multiActiveTabIds],
  );

  const panelStyle = React.useCallback(
    (panelTabId: string, visible: boolean) =>
      multiActiveTabIds
        ? multiPanePanelStyle(visible, panelTabId, tabToPaneId, paneSlotBoxes)
        : undefined,
    [multiActiveTabIds, paneSlotBoxes, tabToPaneId],
  );

  const planReady = mountPlan.mounted.length > 0;

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
      className={
        multiActiveTabIds
          ? "absolute inset-0 flex flex-col min-h-0 min-w-0 pointer-events-none"
          : "absolute inset-0 flex flex-col min-h-0 min-w-0"
      }
    >
      {tabs
        .filter((tab) => {
          const isMultiActive = Boolean(multiActiveTabIds?.includes(tab.id));
          const isRetained =
            mountedTabIds.includes(tab.id) ||
            tab.id === frameActiveTab ||
            isMultiActive;
          if (!isRetained) return false;
          if (isActiveContext && (tab.id === frameActiveTab || isMultiActive)) return true;
          if (!planReady) {
            return isActiveContext || tab.id === frameActiveTab || isMultiActive;
          }
          return isKeyMounted(mountPlan, terminalMountKey(contextId, tab.id));
        })
        .map((tab) => (
          <div
            key={`${contextId}-${tab.id}`}
            className={cn(
              terminalKeepAlivePanelClass(panelVisible(tab.id)),
              multiActiveTabIds && panelVisible(tab.id) && "pointer-events-auto",
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

      {(isUrlSyncedActive ? projectWikiTabVisible : frameActiveTab === "project-wiki") &&
        (!planReady ||
          isKeyMounted(mountPlan, namedTerminalMountKey(contextId, "project-wiki")) ||
          frameActiveTab === "project-wiki") && (
          <div
            className={cn(terminalKeepAlivePanelClass(panelVisible("project-wiki")), multiActiveTabIds && panelVisible("project-wiki") && "pointer-events-auto")}
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

      {(isUrlSyncedActive ? codeReviewTabVisible : frameActiveTab === "code-review") &&
        (!planReady ||
          isKeyMounted(mountPlan, namedTerminalMountKey(contextId, "code-review")) ||
          frameActiveTab === "code-review") && (
          <div
            className={cn(terminalKeepAlivePanelClass(panelVisible("code-review")), multiActiveTabIds && panelVisible("code-review") && "pointer-events-auto")}
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
        (isUrlSyncedActive &&
          (!planReady ||
            isKeyMounted(mountPlan, lightMountKey(contextId, "overview"))))) && (
        <div
          className={cn(lightSurfacePanelClass(panelVisible("overview")), multiActiveTabIds && panelVisible("overview") && "pointer-events-auto")}
          style={panelStyle("overview", panelVisible("overview"))}
        >
          <OverviewTab
            contextId={contextId}
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
            active={
              isActiveContext &&
              panelVisible("overview")
            }
          />
        </div>
      )}

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
        return (
          <TabsPanel
            key={`${contextId}:${file.path}`}
            value={file.path}
            keepMounted
            className={cn(lightSurfacePanelClass(panelVisible(file.path)), multiActiveTabIds && panelVisible(file.path) && "pointer-events-auto")}
          style={panelStyle(file.path, panelVisible(file.path))}
          >
            {isDiffGroupEditorPath(file.path) && currentRepoPath && isUrlSyncedActive ? (
              <ChangesCodeView repoPath={currentRepoPath} groupPath={file.path} />
            ) : isReviewGroupEditorPath(file.path) && isUrlSyncedActive ? (
              <ReviewContextProvider
                target={reviewTarget ?? null}
                filePath=""
                fileSnapshotGuid={null}
                revisionGuid={getReviewGroupRevisionGuid(file.path)}
              >
                <ReviewCodeView groupPath={file.path} />
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
                <DiffViewer
                  repoPath={currentRepoPath}
                  filePath={getEditorSourcePath(file.path)}
                  originalPath={file.path}
                />
              </ReviewContextProvider>
            ) : isConflictResolveEditorPath(file.path) && isUrlSyncedActive ? (
              <GitConflictResolver
                readOnly={isConflictResolveReadOnlyPath(file.path)}
                focusPath={getEditorSourcePath(file.path)}
                editorPath={file.path}
              />
            ) : (
              <FileViewer
                file={file}
                className="flex-1"
                surfaceActive={
                  isActiveContext &&
                  panelVisible(file.path)
                }
              />
            )}
          </TabsPanel>
        );
      })}

      {contextGithubTabs.map((tab) => {
        const shouldMount =
          frameActiveTab === tab.value ||
          (isUrlSyncedActive &&
            planReady &&
            isKeyMounted(mountPlan, lightMountKey(contextId, tab.value)));
        if (!shouldMount) return null;
        return (
          <div
            key={`${contextId}-${tab.value}`}
            className={cn(lightSurfacePanelClass(panelVisible(tab.value)), multiActiveTabIds && panelVisible(tab.value) && "pointer-events-auto")}
          style={panelStyle(tab.value, panelVisible(tab.value))}
          >
            {tab.kind === "github-pr" ? (
              <PRDetailView
                active={
                  isActiveContext &&
                  panelVisible(tab.value)
                }
                branch={tab.branch}
                onClosed={isUrlSyncedActive ? onGithubPullRequestChanged : undefined}
                onMerged={isUrlSyncedActive ? onGithubPullRequestChanged : undefined}
                onRequestClose={
                  isUrlSyncedActive && handleCloseGithubTab
                    ? () => handleCloseGithubTab(tab.value)
                    : () => {}
                }
                owner={tab.owner}
                prNumber={tab.prNumber}
                repo={tab.repo}
              />
            ) : tab.kind === "github-issue" ? (
              <IssueDetailView
                active={
                  isActiveContext &&
                  panelVisible(tab.value)
                }
                owner={tab.owner}
                issueNumber={tab.issueNumber}
                repo={tab.repo}
              />
            ) : tab.kind === "github-action" ? (
              <ActionsDetailView
                active={
                  isActiveContext &&
                  panelVisible(tab.value)
                }
                onRequestClose={
                  isUrlSyncedActive && handleCloseGithubTab
                    ? () => handleCloseGithubTab(tab.value)
                    : () => {}
                }
                owner={tab.owner}
                repo={tab.repo}
                run={tab.run}
                runId={tab.runId}
              />
            ) : (
              <CommitDetailView
                active={
                  isActiveContext &&
                  panelVisible(tab.value)
                }
                onRequestClose={
                  isUrlSyncedActive && handleCloseGithubTab
                    ? () => handleCloseGithubTab(tab.value)
                    : () => {}
                }
                owner={tab.owner}
                repo={tab.repo}
                sha={tab.sha}
                subject={tab.subject}
                authorName={tab.authorName}
              />
            )}
          </div>
        );
      })}

      {contextBrowserTabs.map((tab) => {
        if (
          planReady &&
          !isKeyMounted(mountPlan, browserMountKey(contextId, tab.value)) &&
          !(isActiveContext && frameActiveTab === tab.value)
        ) {
          return null;
        }
        const browserVisible = panelVisible(tab.value);
        return (
          <div
            key={`${contextId}-${tab.value}`}
            aria-hidden={!browserVisible}
            inert={!browserVisible ? true : undefined}
            className={cn(browserKeepAlivePanelClass(browserVisible), multiActiveTabIds && browserVisible && "pointer-events-auto")}
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
            />
          </div>
        );
      })}

      {(isUrlSyncedActive ? simulatorTabVisible : frameActiveTab === "simulator") && (
        <div
          className={cn(lightSurfacePanelClass(panelVisible("simulator")), multiActiveTabIds && panelVisible("simulator") && "pointer-events-auto")}
          style={panelStyle("simulator", panelVisible("simulator"))}
        >
          <SimulatorPanel
            workspaceId={
              isUrlSyncedActive && currentView === "workspace"
                ? (currentWorkspace?.id ?? contextId)
                : contextId
            }
            active={
              isActiveContext &&
              panelVisible("simulator")
            }
          />
        </div>
      )}

      {(isUrlSyncedActive ? gitHistoryTabVisible : frameActiveTab === "git-history") && (
        <div
          className={cn(lightSurfacePanelClass(panelVisible("git-history")), multiActiveTabIds && panelVisible("git-history") && "pointer-events-auto")}
          style={panelStyle("git-history", panelVisible("git-history"))}
        >
          <GitHistoryPanel
            contextId={contextId}
            repoPath={isUrlSyncedActive ? (currentRepoPath ?? null) : null}
          />
        </div>
      )}

      {(isUrlSyncedActive ? changesTabVisible : frameActiveTab === "changes") && (
        <div
          className={cn(lightSurfacePanelClass(panelVisible("changes")), multiActiveTabIds && panelVisible("changes") && "pointer-events-auto")}
          style={panelStyle("changes", panelVisible("changes"))}
        >
          <ChangesPanel
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
        </div>
      )}

      {(isUrlSyncedActive ? reviewTabVisible : frameActiveTab === "review") && (
        <div
          className={cn(lightSurfacePanelClass(panelVisible("review")), multiActiveTabIds && panelVisible("review") && "pointer-events-auto")}
          style={panelStyle("review", panelVisible("review"))}
        >
          <ReviewCenterPanel
            filePath=""
            reviewTarget={isUrlSyncedActive ? (reviewTarget ?? null) : null}
          />
        </div>
      )}

      {(isUrlSyncedActive ? runTabVisible : frameActiveTab === "run") && (
        <div
          className={cn(lightSurfacePanelClass(panelVisible("run")), multiActiveTabIds && panelVisible("run") && "pointer-events-auto")}
          style={panelStyle("run", panelVisible("run"))}
        >
          <RunScript
            workspaceId={
              isUrlSyncedActive && currentView === "workspace"
                ? (currentWorkspace?.id ?? null)
                : null
            }
            projectId={isUrlSyncedActive ? currentProject?.id : undefined}
            isActive={
              isActiveContext &&
              panelVisible("run")
            }
            projectName={isUrlSyncedActive ? currentProject?.name : undefined}
            workspaceName={isUrlSyncedActive ? currentWorkspace?.name : undefined}
          />
        </div>
      )}

      {(isUrlSyncedActive ? githubHubTabVisible : frameActiveTab === "github") && (
        <div
          className={cn(lightSurfacePanelClass(panelVisible("github")), multiActiveTabIds && panelVisible("github") && "pointer-events-auto")}
          style={panelStyle("github", panelVisible("github"))}
        >
          <GithubHubPanel
            currentProjectPath={isUrlSyncedActive ? (currentRepoPath ?? null) : null}
          />
        </div>
      )}

      {(isUrlSyncedActive ? filesTabVisible : frameActiveTab === "files") && (
        <div
          className={cn(lightSurfacePanelClass(panelVisible("files")), multiActiveTabIds && panelVisible("files") && "pointer-events-auto")}
          style={panelStyle("files", panelVisible("files"))}
        >
          <FileTreePanel
            projectName={isUrlSyncedActive ? currentProject?.name : undefined}
            revealEnabled={
              isActiveContext &&
              panelVisible("files")
            }
          />
        </div>
      )}

      {(isUrlSyncedActive ? ptDesignTabVisible : frameActiveTab === "pt-design") && (
        <div
          className={cn(lightSurfacePanelClass(panelVisible("pt-design")), multiActiveTabIds && panelVisible("pt-design") && "pointer-events-auto")}
          style={panelStyle("pt-design", panelVisible("pt-design"))}
        >
          <PtDesignCenterPanel contextId={contextId} />
        </div>
      )}
    </div>
  );
}

export const WorkspaceCenterFrame = React.memo(
  WorkspaceCenterFrameImpl,
  workspaceCenterFramePropsAreEqual,
);
WorkspaceCenterFrame.displayName = "WorkspaceCenterFrame";
