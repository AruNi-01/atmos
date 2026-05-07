"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useGitStore } from "@/hooks/use-git-store";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useProjectStore } from "@/hooks/use-project-store";
import {
  Check,
  Button,
  Tabs,
  TabsList,
  TabsTab,
} from "@workspace/ui";
import {
  Play,
  GitPullRequest,
  GitPullRequestCreate,
  GitPullRequestClosed,
  GitBranch,
  GitCommit as GitCommitIcon,
  File,
  FileCheckCorner,
  FolderOpen,
  FolderTree,
  List,
  ListTree,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryState, useQueryStates } from "nuqs";
import {
  centerStageParams,
  rightSidebarParams,
  rightSidebarModalParams,
  type RightSidebarTab,
} from "@/lib/nuqs/searchParams";
import { useContextParams } from "@/hooks/use-context-params";
import type { ActionRun } from "@/components/github/ActionsPanel";
import dynamic from "next/dynamic";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useGitInfoStore } from "@/hooks/use-git-info-store";
import { PRPanel, type PRPanelHandle } from "@/components/github/PRPanel";
import { CommitsPanel } from "@/components/github/CommitsPanel";
import { ActionsPanel } from "@/components/github/ActionsPanel";
import { useAgentChatUrl } from "@/hooks/use-agent-chat-url";
import { useAgentChatStatusStore } from "@/hooks/use-agent-chat-status";
import { isWorkspaceSetupBlocking } from "@/utils/workspace-setup";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { FileTreePanel } from "@/components/files/FileTreePanel";

import { ChangeSection } from "@/components/layout/sidebar/ChangeSection";
import { CommitActions } from "@/components/layout/sidebar/CommitActions";
import { RightSidebarDialogs } from "@/components/layout/sidebar/RightSidebarDialogs";
import { ReviewContextProvider } from "@/components/diff/review/ReviewContextProvider";
import { ReviewActions } from "@/components/diff/review/ReviewActions";
import { RefreshableTabsTab } from "@/components/ui/RefreshableTabsTab";

const AgentChatPanel = dynamic(
  () => import("@/components/agent/AgentChatPanel").then((m) => m.AgentChatPanel),
  { ssr: false },
);
const RunPreviewPanel = dynamic(
  () =>
    import("@/components/run-preview/RunPreviewPanel").then(
      (m) => m.RunPreviewPanel,
    ),
  { ssr: false },
);
const ReviewView = dynamic(() => import("@/components/diff/ReviewView"), {
  ssr: false,
});

const CHANGES_FILE_VIEW_MODE_STORAGE_KEY =
  "atmos:right-sidebar:changes-file-view-mode";

const BASE_TABS: Array<{
  value: RightSidebarTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "changes", label: "Changes", Icon: GitBranch },
  { value: "review", label: "Review", Icon: FileCheckCorner },
  { value: "run-preview", label: "Run / Preview", Icon: Play },
  { value: "pr", label: "Pull Requests", Icon: GitPullRequest },
  { value: "actions", label: "Actions", Icon: Workflow },
];

const FILES_TAB = { value: "files" as RightSidebarTab, label: "Files", Icon: FolderTree };

interface RightSidebarProps {
  // kept for compatibility if needed, but unused
  changes?: unknown[];
}

const RightSidebar: React.FC<RightSidebarProps> = () => {
  const { workspaceId, projectId: projectIdFromUrl } = useContextParams();
  const currentProjectPath = useEditorStore((s) => s.currentProjectPath);
  const getActiveFilePath = useEditorStore((s) => s.getActiveFilePath);
  const filePath = (workspaceId && getActiveFilePath(workspaceId)) || "";
  const projects = useProjectStore((s) => s.projects);
  const { enqueueAgentChatPrompt, setPendingAgentChatMode } = useDialogStore();
  const [, setAgentChatOpen] = useAgentChatUrl();
  const agentHasAgents = useAgentChatStatusStore((s) => s.hasInstalledAgents);
  const agentIsConnected = useAgentChatStatusStore((s) => s.isConnected);
  const agentIsBusy = useAgentChatStatusStore((s) => s.isBusy);

  // Layout settings
  const { projectFilesSide, loadSettings: loadLayoutSettings } = useLayoutSettings();
  useEffect(() => { loadLayoutSettings(); }, [loadLayoutSettings]);
  const showFilesTab = projectFilesSide === "right";
  const topTabs = useMemo(
    () => (showFilesTab ? [FILES_TAB, ...BASE_TABS] : BASE_TABS),
    [showFilesTab],
  );

  const currentProject = useMemo(
    () =>
      projects.find(
        (p) =>
          (workspaceId && p.workspaces.some((w) => w.id === workspaceId)) ||
          (!workspaceId && projectIdFromUrl === p.id),
      ),
    [projects, workspaceId, projectIdFromUrl],
  );
  const currentWorkspace = useMemo(
    () => currentProject?.workspaces.find((w) => w.id === workspaceId),
    [currentProject, workspaceId],
  );
  const setupProgress = useProjectStore((s) => s.setupProgress);
  const isSettingUp = isWorkspaceSetupBlocking(
    workspaceId ? setupProgress[workspaceId] : null,
  );

  const effectiveContextId = workspaceId || projectIdFromUrl;

  const {
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    compareFiles,
    compareRef,
    setCurrentRepoPath,
    refreshRepositoryState,
    isBranchPublished,
    commitChanges,
    pushChanges,
    stageFiles,
    unstageFiles,
    discardUnstagedChanges,
    discardUntrackedFiles,
    stageAllUnstaged,
    stageAllUntracked,
    unstageAll,
    discardAllUnstaged,
    discardAllUntracked,
    pullChanges,
    fetchChanges,
    syncChanges,
    compareAgainstDefaultBranch,
    resetCompareMode,
    isLoading,
    gitStatus,
  } = useGitStore();

  const [{ rsTab: activeTab }, setSidebarParams] =
    useQueryStates(rightSidebarParams);
  const [activeCenterTab] = useQueryState("tab", centerStageParams.tab);
  const [
    { rsPr: activePrNumber, rsRunId: activeRunId, rsCreatePr },
    setModalParams,
  ] = useQueryStates(rightSidebarModalParams);
  const { activeActionRun, setActiveActionRun } = useDialogStore();

  const [changesSubTab, setChangesSubTab] = useState<"changes" | "commits">(
    "changes",
  );
  const [changesFileViewMode, setChangesFileViewMode] = useState<
    "list" | "tree"
  >(() => {
    if (typeof window === "undefined") return "list";
    const stored = window.localStorage.getItem(
      CHANGES_FILE_VIEW_MODE_STORAGE_KEY,
    );
    return stored === "tree" ? "tree" : "list";
  });
  const [prSubTab, setPRSubTab] = useState<"open" | "closed">("open");
  const [hasVisitedCommits, setHasVisitedCommits] = useState(false);
  const [refreshCommitsPanel, setRefreshCommitsPanel] = useState<
    (() => Promise<unknown> | void) | null
  >(null);
  const [isCommitsLoading, setIsCommitsLoading] = useState(false);
  const [actionsRefreshKey] = useState(0);
  const prPanelRef = useRef<PRPanelHandle>(null);
  const [prPanelLoading, setPRPanelLoading] = useState({
    open: false,
    closed: false,
  });

  const { githubOwner, githubRepo, currentBranch } = useGitInfoStore();

  useEffect(() => {
    window.localStorage.setItem(
      CHANGES_FILE_VIEW_MODE_STORAGE_KEY,
      changesFileViewMode,
    );
  }, [changesFileViewMode]);

  useEffect(() => {
    if (isSettingUp) {
      setCurrentRepoPath(null);
      return;
    }
    setCurrentRepoPath(currentProjectPath || null);
  }, [currentProjectPath, isSettingUp, setCurrentRepoPath]);

  const hasWorkingContext = !!(
    !isSettingUp &&
    currentProjectPath &&
    (workspaceId || projectIdFromUrl)
  );

  const hasChanges =
    stagedFiles.length > 0 ||
    unstagedFiles.length > 0 ||
    untrackedFiles.length > 0;
  const compareStatsByPath = useMemo(
    () => new Map(compareFiles.map((file) => [file.path, file])),
    [compareFiles],
  );
  const displayedStagedFiles = useMemo(
    () =>
      compareRef
        ? stagedFiles
            .filter((file) => compareStatsByPath.has(file.path))
            .map((file) => ({
              ...file,
              additions:
                compareStatsByPath.get(file.path)?.additions ?? file.additions,
              deletions:
                compareStatsByPath.get(file.path)?.deletions ?? file.deletions,
            }))
        : stagedFiles,
    [compareRef, compareStatsByPath, stagedFiles],
  );
  const displayedUnstagedFiles = useMemo(
    () =>
      compareRef
        ? unstagedFiles
            .filter((file) => compareStatsByPath.has(file.path))
            .map((file) => ({
              ...file,
              additions:
                compareStatsByPath.get(file.path)?.additions ?? file.additions,
              deletions:
                compareStatsByPath.get(file.path)?.deletions ?? file.deletions,
            }))
        : unstagedFiles,
    [compareRef, compareStatsByPath, unstagedFiles],
  );
  const displayedUntrackedFiles = useMemo(
    () => (compareRef ? untrackedFiles : untrackedFiles),
    [compareRef, untrackedFiles],
  );
  const hasDisplayedChanges =
    displayedStagedFiles.length > 0 ||
    displayedUnstagedFiles.length > 0 ||
    displayedUntrackedFiles.length > 0;
  const showWikiAskSidebar = activeCenterTab === "wiki";

  const handleCommitsRefreshReady = useCallback(
    (refresh: () => Promise<unknown> | void) => {
      setRefreshCommitsPanel(() => refresh);
    },
    [],
  );
  const handleCommitsLoadingChange = useCallback((loading: boolean) => {
    setIsCommitsLoading(loading);
  }, []);

  const handleChangesRefresh = useCallback(async () => {
    resetCompareMode();
    await refreshRepositoryState({ fetchRemote: true });
  }, [refreshRepositoryState, resetCompareMode]);

  const renderNoContextMessage = (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground/50">
      <FolderOpen className="size-8 opacity-20 mb-2" />
      <span className="text-xs text-center">
        Select a project or workspace to view changes
      </span>
    </div>
  );

  return (
    <aside className="w-full flex flex-col h-full">
      <div className={cn("flex-1 min-h-0", !showWikiAskSidebar && "hidden")}>
        <AgentChatPanel
          variant="sidebar"
          mode="wiki_ask"
          publishStatus={false}
        />
      </div>
      <div className={cn("flex-1 min-h-0", showWikiAskSidebar && "hidden")}>
        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            setSidebarParams({ rsTab: v as RightSidebarTab })
          }
          className="flex flex-col h-full"
        >
          {/* Top-level icon-only tabs bar */}
          <TabsList
            className={cn(
              "w-full h-10 gap-0 rounded-none bg-transparent px-1 py-0",
              "border-b border-sidebar-border shrink-0",
            )}
          >
            {topTabs.map(({ value, label, Icon }) => (
              <TabsTab
                key={value}
                value={value}
                title={label}
                aria-label={label}
                className={cn(
                  "flex-1 h-full min-w-0 p-0 gap-0",
                  "focus-visible:ring-0 focus-visible:ring-offset-0",
                )}
              >
                <Icon className="size-4" />
              </TabsTab>
            ))}
          </TabsList>

          {/* Files tab content */}
          {showFilesTab && (
            <div
              className={cn(
                "flex-1 flex flex-col min-h-0",
                activeTab !== "files" && "hidden",
              )}
            >
              <FileTreePanel projectName={currentProject?.name} />
            </div>
          )}

          {/* Changes tab content */}
          <div
            className={cn(
              "flex-1 flex flex-col min-h-0",
              activeTab !== "changes" && "hidden",
            )}
          >
            {hasWorkingContext ? (
              <>
                {/* Files / Commits sub-tabs */}
                <div className="flex border-b border-sidebar-border shrink-0 bg-background/50 backdrop-blur-sm h-9">
                  <Tabs
                    value={changesSubTab}
                    onValueChange={(v) => {
                      const next = v as "changes" | "commits";
                      setChangesSubTab(next);
                      if (next === "commits") {
                        setHasVisitedCommits(true);
                      }
                    }}
                    className="flex-1 h-full min-w-0"
                  >
                    <TabsList
                      variant="underline"
                      className="h-full w-full gap-0 py-0!"
                    >
                      <RefreshableTabsTab
                        value="changes"
                        activeValue={changesSubTab}
                        refreshTitle="Refresh changes"
                        onRefresh={handleChangesRefresh}
                        isRefreshing={changesSubTab === "changes" && isLoading}
                        trailingAction={({ isVisible }) => (
                          <span
                            role="button"
                            title={
                              changesFileViewMode === "tree"
                                ? "Show as list"
                                : "Show as tree"
                            }
                            aria-label={
                              changesFileViewMode === "tree"
                                ? "Show changed files as list"
                                : "Show changed files as tree"
                            }
                            tabIndex={isVisible ? 0 : -1}
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setChangesFileViewMode((mode) =>
                                mode === "tree" ? "list" : "tree",
                              );
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ")
                                return;
                              event.preventDefault();
                              event.stopPropagation();
                              setChangesFileViewMode((mode) =>
                                mode === "tree" ? "list" : "tree",
                              );
                            }}
                            className="flex h-full w-8 cursor-pointer items-center justify-center border-l border-sidebar-border/60 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                          >
                            {changesFileViewMode === "tree" ? (
                              <List className="size-3.5" />
                            ) : (
                              <ListTree className="size-3.5" />
                            )}
                          </span>
                        )}
                        className="flex-1 h-full! text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
                      >
                        <File className="size-3.5" />
                        <span>Files</span>
                      </RefreshableTabsTab>
                      <RefreshableTabsTab
                        value="commits"
                        activeValue={changesSubTab}
                        refreshTitle="Refresh commits"
                        onRefresh={async () => {
                          await refreshCommitsPanel?.();
                        }}
                        isRefreshing={
                          changesSubTab === "commits" && isCommitsLoading
                        }
                        className="flex-1 h-full! text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
                      >
                        <GitCommitIcon className="size-3.5" />
                        <span>Commits</span>
                      </RefreshableTabsTab>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Content */}
                <div
                  className={cn(
                    "flex-1 min-h-0 no-scrollbar overflow-y-auto",
                    changesSubTab !== "commits" && "p-2",
                    changesSubTab !== "commits" &&
                      !hasDisplayedChanges &&
                      !isLoading &&
                      "flex items-center justify-center",
                  )}
                >
                  <div className={cn(changesSubTab === "commits" && "hidden")}>
                    {!hasDisplayedChanges && !isLoading ? (
                      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/50 gap-3">
                        <Check className="size-8 opacity-20 mb-2" />
                        <span className="text-xs">
                          {compareRef
                            ? `No changes against ${compareRef}`
                            : "No changes detected"}
                        </span>
                        {!compareRef && gitStatus?.default_branch ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              void compareAgainstDefaultBranch();
                            }}
                          >
                            Compare with origin/{gitStatus.default_branch}
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <ChangeSection
                          kind="staged"
                          title="Staged Changes"
                          files={displayedStagedFiles}
                          workspaceId={workspaceId}
                          viewMode={changesFileViewMode}
                          onUnstage={unstageFiles}
                          onUnstageAll={unstageAll}
                        />
                        <ChangeSection
                          kind="unstaged"
                          title="Unstaged Changes"
                          files={displayedUnstagedFiles}
                          workspaceId={workspaceId}
                          viewMode={changesFileViewMode}
                          onStage={stageFiles}
                          onDiscard={discardUnstagedChanges}
                          onStageAll={stageAllUnstaged}
                          onDiscardAll={discardAllUnstaged}
                        />
                        <ChangeSection
                          kind="untracked"
                          title="Untracked Changes"
                          files={displayedUntrackedFiles}
                          workspaceId={workspaceId}
                          viewMode={changesFileViewMode}
                          onStage={stageFiles}
                          onDiscard={discardUntrackedFiles}
                          onStageAll={stageAllUntracked}
                          onDiscardAll={discardAllUntracked}
                        />
                      </>
                    )}
                  </div>

                  <div
                    className={cn(
                      changesSubTab !== "commits" && "hidden",
                      "-mx-0 flex-1 h-full",
                    )}
                  >
                    {hasVisitedCommits && currentProjectPath && currentBranch ? (
                      <CommitsPanel
                        repoPath={currentProjectPath}
                        branch={currentBranch}
                        owner={githubOwner ?? undefined}
                        repo={githubRepo ?? undefined}
                        onRefreshReady={handleCommitsRefreshReady}
                        onLoadingChange={handleCommitsLoadingChange}
                      />
                    ) : currentProjectPath && currentBranch ? null : (
                      <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground/50">
                        <span className="text-xs">No repository context</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Commit Actions (Sticky Bottom) - only on Files sub-tab */}
                {changesSubTab !== "commits" && (
                  <CommitActions
                    currentProjectPath={currentProjectPath}
                    currentProject={currentProject}
                    currentWorkspace={currentWorkspace}
                    workspaceId={workspaceId}
                    projectId={projectIdFromUrl}
                    stagedFiles={stagedFiles}
                    unstagedFiles={unstagedFiles}
                    isBranchPublished={isBranchPublished}
                    gitStatus={gitStatus}
                    hasChanges={hasChanges}
                    commitChanges={commitChanges}
                    pushChanges={pushChanges}
                    stageAllUnstaged={stageAllUnstaged}
                    pullChanges={pullChanges}
                    fetchChanges={fetchChanges}
                    syncChanges={syncChanges}
                    agentHasAgents={agentHasAgents}
                    agentIsConnected={agentIsConnected}
                    agentIsBusy={agentIsBusy}
                    enqueueAgentChatPrompt={enqueueAgentChatPrompt}
                    setPendingAgentChatMode={setPendingAgentChatMode}
                    setAgentChatOpen={setAgentChatOpen}
                  />
                )}
              </>
            ) : (
              renderNoContextMessage
            )}
          </div>

          {/* PR tab content */}
          <div
            className={cn(
              "flex-1 flex flex-col min-h-0",
              activeTab !== "pr" && "hidden",
            )}
          >
            {hasWorkingContext ? (
              githubOwner && githubRepo && currentBranch ? (
                <>
                  {/* Open / Closed sub-tabs */}
                  <div className="flex border-b border-sidebar-border shrink-0 bg-background/50 backdrop-blur-sm h-9">
                    <Tabs
                      value={prSubTab}
                      onValueChange={(v) => setPRSubTab(v as "open" | "closed")}
                      className="flex-1 h-full min-w-0"
                    >
                      <TabsList
                        variant="underline"
                        className="h-full w-full gap-0 py-0!"
                      >
                        <RefreshableTabsTab
                          value="open"
                          activeValue={prSubTab}
                          refreshTitle="Refresh open pull requests"
                          onRefresh={() => prPanelRef.current?.refreshOpen()}
                          isRefreshing={
                            prSubTab === "open" && prPanelLoading.open
                          }
                          className="flex-1 h-full! text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
                        >
                          <GitPullRequestCreate className="size-3.5" />
                          <span>Open</span>
                        </RefreshableTabsTab>
                        <RefreshableTabsTab
                          value="closed"
                          activeValue={prSubTab}
                          refreshTitle="Refresh closed pull requests"
                          onRefresh={() => prPanelRef.current?.refreshClosed()}
                          isRefreshing={
                            prSubTab === "closed" && prPanelLoading.closed
                          }
                          className="flex-1 h-full! text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
                        >
                          <GitPullRequestClosed className="size-3.5" />
                          <span>Closed</span>
                        </RefreshableTabsTab>
                      </TabsList>
                    </Tabs>
                  </div>
                  <div className="flex-1 min-h-0 no-scrollbar overflow-y-auto pt-0 px-2 pb-2">
                    <PRPanel
                      ref={prPanelRef}
                      owner={githubOwner}
                      repo={githubRepo}
                      branch={currentBranch}
                      onPrClick={(num) => setModalParams({ rsPr: num })}
                      prSubTab={prSubTab}
                      onLoadingChange={setPRPanelLoading}
                    />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 py-10">
                  <GitPullRequest className="size-8 opacity-20 mb-2" />
                  <span className="text-xs text-center">
                    Not a GitHub repository
                  </span>
                </div>
              )
            ) : (
              renderNoContextMessage
            )}
          </div>

          {/* Actions tab content */}
          <div
            className={cn(
              "flex-1 flex flex-col min-h-0",
              activeTab !== "actions" && "hidden",
            )}
          >
            {hasWorkingContext ? (
              githubOwner && githubRepo && currentBranch ? (
                <div className="flex-1 min-h-0 no-scrollbar overflow-y-auto pt-0 px-2 pb-2">
                  <ActionsPanel
                    key={actionsRefreshKey}
                    owner={githubOwner}
                    repo={githubRepo}
                    branch={currentBranch}
                    onRunClick={(run: ActionRun) => {
                      setActiveActionRun(run);
                      setModalParams({ rsRunId: run.databaseId });
                    }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 py-10">
                  <Workflow className="size-8 opacity-20 mb-2" />
                  <span className="text-xs text-center">
                    Not a GitHub repository
                  </span>
                </div>
              )
            ) : (
              renderNoContextMessage
            )}
          </div>

          {/* Review tab content */}
          <div
            className={cn(
              "flex-1 flex flex-col min-h-0",
              activeTab !== "review" && "hidden",
            )}
          >
            {hasWorkingContext ? (
              <ReviewContextProvider
                workspaceId={workspaceId}
                filePath={filePath}
              >
                {/* Review actions bar */}
                <div className="flex border-b border-sidebar-border shrink-0 bg-background/50 backdrop-blur-sm h-9 items-stretch">
                  <ReviewActions />
                </div>
                <div className="flex-1 min-h-0">
                  <ReviewView />
                </div>
              </ReviewContextProvider>
            ) : (
              renderNoContextMessage
            )}
          </div>

          {/* Run/Preview tab content */}
          <div
            className={cn(
              "flex-1 min-h-0",
              activeTab !== "run-preview" && "hidden",
            )}
          >
            <RunPreviewPanel
              workspaceId={effectiveContextId}
              projectId={currentProject?.id}
              isActive={activeTab === "run-preview"}
              projectName={currentProject?.name}
              workspaceName={currentWorkspace?.name}
            />
          </div>
        </Tabs>

        <RightSidebarDialogs
          githubOwner={githubOwner}
          githubRepo={githubRepo}
          currentBranch={currentBranch}
          activePrNumber={activePrNumber}
          onClosePr={() => setModalParams({ rsPr: null })}
          onPrMerged={() => {
            void refreshRepositoryState({ fetchRemote: true });
          }}
          activeRunId={activeRunId}
          activeActionRun={activeActionRun}
          onCloseActions={() => {
            setActiveActionRun(null);
            setModalParams({ rsRunId: null });
          }}
          rsCreatePr={!!rsCreatePr}
          onCloseCreatePr={() => setModalParams({ rsCreatePr: false })}
          onPrCreated={() => prPanelRef.current?.refreshOpen()}
        />
      </div>
    </aside>
  );
};

export default RightSidebar;
