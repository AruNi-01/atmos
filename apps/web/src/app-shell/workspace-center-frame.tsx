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
  lightSurfacePanelClass,
  namedTerminalMountKey,
  resolveFrameActiveTab,
  terminalKeepAlivePanelClass,
  terminalMountKey,
} from "@/app-shell/workspace-surface-policies";
import { readCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";
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

export const EMPTY_MOUNTED_TAB_IDS: string[] = [];

function WorkspaceCenterFrameImpl({
  contextId,
  isActiveContext,
  isUrlSyncedActive,
  mountPlan,
  mountedTabIds,
  fallbackTerminalTitle,
  activeValue,
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
    FIXED_TERMINAL_TAB_VALUE,
  ];
  const frameActiveTab = resolveFrameActiveTab({
    isActiveFrame: isActiveContext,
    urlOrEditorTab: isUrlSyncedActive ? activeValue : null,
    lastCenterTab: lastTab,
    fallbackTab: FIXED_TERMINAL_TAB_VALUE,
    validTabs,
  });

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
      className="absolute inset-0 flex flex-col min-h-0 min-w-0"
    >
      {tabs
        .filter((tab) => {
          const isRetained =
            mountedTabIds.includes(tab.id) || tab.id === frameActiveTab;
          if (!isRetained) return false;
          if (isActiveContext && tab.id === frameActiveTab) return true;
          if (!planReady) {
            return isActiveContext || tab.id === frameActiveTab;
          }
          return isKeyMounted(mountPlan, terminalMountKey(contextId, tab.id));
        })
        .map((tab) => (
          <div
            key={`${contextId}-${tab.id}`}
            className={terminalKeepAlivePanelClass(
              isFramePanelVisible({
                isActiveFrame: isActiveContext,
                frameActiveTab,
                panelTabId: tab.id,
              }),
            )}
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
                  isFramePanelVisible({
                    isActiveFrame: isActiveContext,
                    frameActiveTab,
                    panelTabId: tab.id,
                  })
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
            className={terminalKeepAlivePanelClass(
              isFramePanelVisible({
                isActiveFrame: isActiveContext,
                frameActiveTab,
                panelTabId: "project-wiki",
              }),
            )}
          >
            <TerminalGrid
              ref={isUrlSyncedActive ? projectWikiTerminalGridRef : undefined}
              workspaceId={contextId}
              scope="project-wiki"
              toolbarActions={{ split: false, maximize: false, close: false }}
              className="h-full"
              isSurfaceActive={
                isActiveContext &&
                isFramePanelVisible({
                  isActiveFrame: isActiveContext,
                  frameActiveTab,
                  panelTabId: "project-wiki",
                })
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
            className={terminalKeepAlivePanelClass(
              isFramePanelVisible({
                isActiveFrame: isActiveContext,
                frameActiveTab,
                panelTabId: "code-review",
              }),
            )}
          >
            <TerminalGrid
              ref={isUrlSyncedActive ? codeReviewTerminalGridRef : undefined}
              workspaceId={contextId}
              scope="code-review"
              toolbarActions={{ split: false, maximize: false, close: false }}
              className="h-full"
              isSurfaceActive={
                isActiveContext &&
                isFramePanelVisible({
                  isActiveFrame: isActiveContext,
                  frameActiveTab,
                  panelTabId: "code-review",
                })
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
          className={lightSurfacePanelClass(
            isFramePanelVisible({
              isActiveFrame: isActiveContext,
              frameActiveTab,
              panelTabId: "overview",
            }),
          )}
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
        if (planReady && !isKeyMounted(mountPlan, editorMountKey(contextId, file.path))) {
          if (!(isUrlSyncedActive && activeValue === file.path)) {
            if (!(isActiveContext && frameActiveTab === file.path)) {
              return null;
            }
          }
        }
        return (
          <TabsPanel
            key={`${contextId}:${file.path}`}
            value={file.path}
            keepMounted
            className={lightSurfacePanelClass(
              isFramePanelVisible({
                isActiveFrame: isActiveContext,
                frameActiveTab,
                panelTabId: file.path,
              }),
            )}
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
        const shouldMount =
          frameActiveTab === tab.value ||
          (isUrlSyncedActive &&
            planReady &&
            isKeyMounted(mountPlan, lightMountKey(contextId, tab.value)));
        if (!shouldMount) return null;
        return (
          <div
            key={`${contextId}-${tab.value}`}
            className={lightSurfacePanelClass(
              isFramePanelVisible({
                isActiveFrame: isActiveContext,
                frameActiveTab,
                panelTabId: tab.value,
              }),
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
                  isFramePanelVisible({
                    isActiveFrame: isActiveContext,
                    frameActiveTab,
                    panelTabId: tab.value,
                  })
                }
                owner={tab.owner}
                issueNumber={tab.issueNumber}
                repo={tab.repo}
              />
            ) : tab.kind === "github-action" ? (
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
                  isFramePanelVisible({
                    isActiveFrame: isActiveContext,
                    frameActiveTab,
                    panelTabId: tab.value,
                  })
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
        return (
          <div
            key={`${contextId}-${tab.value}`}
            className={lightSurfacePanelClass(
              isFramePanelVisible({
                isActiveFrame: isActiveContext,
                frameActiveTab,
                panelTabId: tab.value,
              }),
            )}
          >
            <BrowserPanel
              workspaceId={
                isUrlSyncedActive && currentView === "workspace"
                  ? (currentWorkspace?.id ?? null)
                  : null
              }
              projectId={isUrlSyncedActive ? currentProject?.id : undefined}
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
}

export const WorkspaceCenterFrame = React.memo(
  WorkspaceCenterFrameImpl,
  workspaceCenterFramePropsAreEqual,
);
WorkspaceCenterFrame.displayName = "WorkspaceCenterFrame";
