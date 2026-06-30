"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { useGitStore } from "@/features/git/store/use-git-store";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useProjectStore } from "@/features/project/store/use-project-store";
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
  FileDiff,
  FolderOpen,
  FolderTree,
  List,
  ListTree,
  Workflow,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useQueryStates } from "nuqs";
import {
  centerStageParams,
  rightSidebarParams,
  rightSidebarModalParams,
  type RightSidebarTab,
} from "@/shared/lib/nuqs/searchParams";
import { useContextParams } from "@/shared/hooks/use-context-params";
import type { ActionRun } from "@/features/github/components/ActionsPanel";
import dynamic from "next/dynamic";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import { useGitInfoStore } from "@/features/git/store/use-git-info-store";
import { PRPanel, type PRPanelHandle } from "@/features/github/components/PRPanel";
import { CommitsPanel } from "@/features/github/components/CommitsPanel";
import { ActionsPanel } from "@/features/github/components/ActionsPanel";
import { isWorkspaceSetupBlocking } from "@/features/workspace/lib/workspace-setup";
import { useLayoutSettingsStore } from "@/features/settings/store/layout-settings-store";
import { FileTreePanel } from "@/features/files/components/FileTreePanel";

import { ChangeSection } from "@/app-shell/sidebar/ChangeSection";
import { ChangesScopeMenu } from "@/app-shell/sidebar/ChangesScopeMenu";
import { CommitActionsContainer } from "@/app-shell/sidebar/CommitActionsContainer";
import { RightSidebarDialogs } from "@/app-shell/sidebar/RightSidebarDialogs";
import { useRightSidebarChangesScope } from "@/app-shell/sidebar/useRightSidebarChangesScope";
import { ReviewContextProvider } from "@/features/diff/components/review/ReviewContextProvider";
import type { ReviewTarget } from "@/api/ws-api";
import { ReviewActions } from "@/features/diff/components/review/ReviewActions";
import { RefreshableTabsTab } from "@/shared/components/ui/RefreshableTabsTab";
import { useSidebarUiPrefs } from "@/shared/stores/use-ui-pref-hooks";

const AgentChatPanel = dynamic(
  () => import("@/features/agent/components/AgentChatPanel").then((m) => m.AgentChatPanel),
  { ssr: false },
);
const RunPreviewPanel = dynamic(
  () =>
    import("@/features/run-preview/components/RunPreviewPanel").then(
      (m) => m.RunPreviewPanel,
    ),
  { ssr: false },
);
const ReviewView = dynamic(() => import("@/features/diff/components/ReviewView"), {
  ssr: false,
});

const BASE_TABS: Array<{
  value: RightSidebarTab;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "changes", labelKey: "rightSidebar.topTabs.changes", Icon: GitBranch },
  { value: "review", labelKey: "rightSidebar.topTabs.review", Icon: FileDiff },
  { value: "run-preview", labelKey: "rightSidebar.topTabs.runPreview", Icon: Play },
  { value: "pr", labelKey: "rightSidebar.topTabs.pullRequests", Icon: GitPullRequest },
  { value: "actions", labelKey: "rightSidebar.topTabs.actions", Icon: Workflow },
];

const FILES_TAB = { value: "files" as RightSidebarTab, labelKey: "common.files", Icon: FolderTree };

function buildWikiChatPrompt(
  prompt: string,
  projectRoot: string | null | undefined,
  wikiPage: string | null | undefined,
): string {
  const wikiDir = projectRoot ? `${projectRoot}/.atmos/wiki` : ".atmos/wiki";
  const normalizedPage = wikiPage
    ? (wikiPage.endsWith(".md") ? wikiPage : `${wikiPage}.md`)
    : null;

  return [
    "You are helping inside Atmos Project Wiki.",
    "Treat this conversation as Project Wiki context.",
    projectRoot ? `Project root: ${projectRoot}` : "Project root: use the current repository root.",
    `Wiki directory: ${wikiDir}`,
    normalizedPage ? `Current wiki page: ${normalizedPage}` : null,
    "Prioritize information from the generated wiki. Read relevant files under the wiki directory before answering when the question depends on project knowledge. If the wiki content is missing or insufficient, say that clearly and then use repository context as supporting evidence.",
    "",
    "User question:",
    prompt,
  ].filter(Boolean).join("\n");
}

interface RightSidebarProps {
  // kept for compatibility if needed, but unused
  changes?: unknown[];
}

const RightSidebar: React.FC<RightSidebarProps> = () => {
  const t = useTranslations("AppShell.chrome");
  const { workspaceId, projectId: projectIdFromUrl } = useContextParams();
  const currentProjectPath = useEditorStore((s) => s.currentProjectPath);
  const getActiveFilePath = useEditorStore((s) => s.getActiveFilePath);
  const contextId = workspaceId || projectIdFromUrl;
  const filePath = (contextId && getActiveFilePath(contextId)) || "";
  const projects = useProjectStore((s) => s.projects);
  // Layout settings
  const projectFilesSide = useLayoutSettingsStore((s) => s.projectFilesSide);
  const loadLayoutSettings = useLayoutSettingsStore((s) => s.loadSettings);
  useEffect(() => { loadLayoutSettings(); }, [loadLayoutSettings]);
  const showFilesTab = projectFilesSide === "right";
  const topTabs = useMemo(() => {
    if (!showFilesTab) return BASE_TABS;
    const idx = BASE_TABS.findIndex((t) => t.value === "run-preview");
    return [...BASE_TABS.slice(0, idx + 1), FILES_TAB, ...BASE_TABS.slice(idx + 1)];
  }, [showFilesTab]);

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
  const runPreviewProjectId = projectIdFromUrl ?? currentProject?.id ?? null;
  const setupProgress = useProjectStore((s) => s.setupProgress);
  const isSettingUp = isWorkspaceSetupBlocking(
    workspaceId ? setupProgress[workspaceId] : null,
  );

  const reviewTarget = useMemo((): ReviewTarget | null => {
    if (workspaceId) return { kind: "workspace", workspaceId };
    if (projectIdFromUrl) return { kind: "project", projectId: projectIdFromUrl };
    return null;
  }, [workspaceId, projectIdFromUrl]);

  const {
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    compareFiles,
    compareRef,
    setCurrentRepoPath,
    refreshRepositoryState,
    stageFiles,
    unstageFiles,
    discardUnstagedChanges,
    discardUntrackedFiles,
    stageAllUnstaged,
    stageAllUntracked,
    unstageAll,
    discardAllUnstaged,
    discardAllUntracked,
    compareAgainstDefaultBranch,
    compareAgainstRef,
    compareWorktreeChanges,
    resetCompareMode,
    isLoading,
    gitStatus,
  } = useGitStore();

  const [{ rsTab: activeTab }, setSidebarParams] =
    useQueryStates(rightSidebarParams);
  const [{ tab: activeCenterTab, wikiPage: activeWikiPage }] =
    useQueryStates(centerStageParams);
  const [
    { rsPr: activePrNumber, rsRunId: activeRunId, rsCreatePr },
    setModalParams,
  ] = useQueryStates(rightSidebarModalParams);
  const { activeActionRun, setActiveActionRun } = useDialogStore();

  const [changesSubTab, setChangesSubTab] = useState<"changes" | "commits">(
    "changes",
  );
  const [sidebarUi, setSidebarUi] = useSidebarUiPrefs();
  const changesFileViewMode = sidebarUi.changesFileViewMode;
  const setChangesFileViewMode = (mode: "list" | "tree") =>
    setSidebarUi({ changesFileViewMode: mode });
  const [prSubTab, setPRSubTab] = useState<"open" | "closed">("open");
  const [hasVisitedCommits, setHasVisitedCommits] = useState(false);
  const [actionsRefreshKey] = useState(0);
  const prPanelRef = useRef<PRPanelHandle>(null);
  const [prPanelLoading, setPRPanelLoading] = useState({
    open: false,
    closed: false,
  });

  const { githubOwner, githubRepo, currentBranch } = useGitInfoStore();

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
  const markCommitsVisited = useCallback(() => {
    setHasVisitedCommits(true);
  }, []);
  const {
    changesScope,
    selectedCommitHash,
    selectedCommitLabel,
    emptyCompareLabel,
    changesScopeMenuOpen,
    setChangesScopeMenuOpen,
    commitLog,
    displayedComparedFiles,
    displayedStagedFiles,
    displayedUnstagedFiles,
    displayedUntrackedFiles,
    hasDisplayedChanges,
    defaultBranchFallback,
    handleSelectChangesScope,
    handleSelectCommitScope,
    handleChangesRefresh,
  } = useRightSidebarChangesScope({
    currentProjectPath,
    currentBranch,
    hasWorkingContext,
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    compareFiles,
    compareRef,
    gitStatus,
    resetCompareMode,
    refreshRepositoryState,
    compareAgainstRef,
    compareWorktreeChanges,
    onVisitCommits: markCommitsVisited,
  });
  const showAgentChatSidebar = activeCenterTab === "wiki";
  const transformWikiChatPrompt = useCallback(
    (prompt: string) =>
      buildWikiChatPrompt(
        prompt,
        currentProject?.mainFilePath ?? currentProjectPath,
        activeWikiPage,
      ),
    [activeWikiPage, currentProject?.mainFilePath, currentProjectPath],
  );

  const renderNoContextMessage = (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground/50">
      <FolderOpen className="size-8 opacity-20 mb-2" />
      <span className="text-xs text-center">
        {t("rightSidebar.noContext")}
      </span>
    </div>
  );

  return (
    <aside className="w-full flex flex-col h-full">
      <div className={cn("flex-1 min-h-0", !showAgentChatSidebar && "hidden")}>
        <AgentChatPanel
          variant="sidebar"
          mode="default"
          publishStatus={false}
          active={showAgentChatSidebar}
          transformPrompt={transformWikiChatPrompt}
        />
      </div>
      <div className={cn("flex-1 min-h-0", showAgentChatSidebar && "hidden")}>
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
            {topTabs.map(({ value, labelKey, Icon }) => {
              const label = t(labelKey);
              return (
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
              );
            })}
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
                        refreshTitle={t("rightSidebar.changes.refreshChanges")}
                        onRefresh={handleChangesRefresh}
                        isRefreshing={changesSubTab === "changes" && isLoading}
                        forceActionsVisible={changesScopeMenuOpen}
                        trailingAction={({ isVisible }) => (
                          <>
                            <ChangesScopeMenu
                              scope={changesScope}
                              selectedCommitHash={selectedCommitHash}
                              commits={commitLog.commits}
                              loadingCommits={commitLog.loading}
                              stagedCount={displayedStagedFiles.length}
                              unstagedCount={
                                displayedUnstagedFiles.length + displayedUntrackedFiles.length
                              }
                              open={changesScopeMenuOpen}
                              isVisible={isVisible}
                              onOpenChange={setChangesScopeMenuOpen}
                              onSelectScope={handleSelectChangesScope}
                              onSelectCommit={handleSelectCommitScope}
                            />
                            <span
                              role="button"
                              title={
                                changesFileViewMode === "tree"
                                  ? t("rightSidebar.changes.showAsList")
                                  : t("rightSidebar.changes.showAsTree")
                              }
                              aria-label={
                                changesFileViewMode === "tree"
                                  ? t("rightSidebar.changes.showChangedFilesAsList")
                                  : t("rightSidebar.changes.showChangedFilesAsTree")
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
                                setChangesFileViewMode(
                                  changesFileViewMode === "tree" ? "list" : "tree",
                                );
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ")
                                  return;
                                event.preventDefault();
                                event.stopPropagation();
                                setChangesFileViewMode(
                                  changesFileViewMode === "tree" ? "list" : "tree",
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
                          </>
                        )}
                        className="h-full! basis-2/3 flex-[2_1_0%] text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
                      >
                        <File className="size-3.5" />
                        <span>{t("rightSidebar.changes.diffTab")}</span>
                      </RefreshableTabsTab>
                      <RefreshableTabsTab
                        value="commits"
                        activeValue={changesSubTab}
                        refreshTitle={t("rightSidebar.changes.refreshCommits")}
                        onRefresh={async () => {
                          await commitLog.refresh();
                        }}
                        isRefreshing={
                          changesSubTab === "commits" && commitLog.loading
                        }
                        className="h-full! basis-1/3 flex-[1_1_0%] text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
                      >
                        <GitCommitIcon className="size-3.5" />
                        <span>{t("common.commits")}</span>
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
                          {changesScope === "commit" && selectedCommitLabel
                            ? t("rightSidebar.changes.noCommitChanges", {
                                commit: selectedCommitLabel,
                              })
                            : emptyCompareLabel
                            ? t("rightSidebar.changes.noChangesAgainst", {
                                compareRef: emptyCompareLabel,
                              })
                            : t("rightSidebar.changes.noChangesDetected")}
                        </span>
                        {defaultBranchFallback ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              void compareAgainstDefaultBranch();
                            }}
                          >
                            {t("rightSidebar.changes.compareWithDefaultBranch", {
                              branch: defaultBranchFallback,
                            })}
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      changesScope === "branch" || changesScope === "commit" ? (
                        <ChangeSection
                          kind={changesScope === "commit" ? "commit" : "branch"}
                          title={
                            changesScope === "commit" && selectedCommitLabel
                              ? t("rightSidebar.changes.commitChanges", {
                                  commit: selectedCommitLabel,
                                })
                              : t("rightSidebar.changes.branchChanges")
                          }
                          files={displayedComparedFiles}
                          workspaceId={workspaceId}
                          viewMode={changesFileViewMode}
                          hideHeader
                        />
                      ) : changesScope === "staged" ? (
                        <ChangeSection
                          kind="staged"
                          title={t("rightSidebar.changes.stagedChanges")}
                          files={displayedStagedFiles}
                          workspaceId={workspaceId}
                          viewMode={changesFileViewMode}
                          hideHeader
                          onUnstage={unstageFiles}
                          onUnstageAll={unstageAll}
                        />
                      ) : (
                        <>
                          <ChangeSection
                            kind="unstaged"
                            title={t("rightSidebar.changes.unstagedChanges")}
                            files={displayedUnstagedFiles}
                            workspaceId={workspaceId}
                            viewMode={changesFileViewMode}
                            hideHeader
                            onStage={stageFiles}
                            onDiscard={discardUnstagedChanges}
                            onStageAll={stageAllUnstaged}
                            onDiscardAll={discardAllUnstaged}
                          />
                          <ChangeSection
                            kind="untracked"
                            title={t("rightSidebar.changes.untrackedChanges")}
                            files={displayedUntrackedFiles}
                            workspaceId={workspaceId}
                            viewMode={changesFileViewMode}
                            hideHeader
                            onStage={stageFiles}
                            onDiscard={discardUntrackedFiles}
                            onStageAll={stageAllUntracked}
                            onDiscardAll={discardAllUntracked}
                          />
                        </>
                      )
                    )}
                  </div>

                  <div
                    className={cn(
                      changesSubTab !== "commits" && "hidden",
                      "-mx-0 flex-1 h-full",
                    )}
                  >
                    {hasVisitedCommits && currentProjectPath ? (
                      <CommitsPanel
                        commits={commitLog.commits}
                        loading={commitLog.loading}
                        page={commitLog.page}
                        hasMore={commitLog.hasMore}
                        goToPrevPage={commitLog.goToPrevPage}
                        goToNextPage={commitLog.goToNextPage}
                        owner={githubOwner ?? undefined}
                        repo={githubRepo ?? undefined}
                      />
                    ) : currentProjectPath ? null : (
                      <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground/50">
                        <span className="text-xs">{t("rightSidebar.changes.noRepositoryContext")}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Commit Actions (Sticky Bottom) - only on Files sub-tab */}
                {changesSubTab !== "commits" && (
                  <CommitActionsContainer
                    currentProjectPath={currentProjectPath}
                    currentProject={currentProject}
                    currentWorkspace={currentWorkspace}
                    workspaceId={workspaceId}
                    projectId={projectIdFromUrl}
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
                          refreshTitle={t("rightSidebar.pr.refreshOpenPullRequests")}
                          onRefresh={() => prPanelRef.current?.refreshOpen()}
                          isRefreshing={
                            prSubTab === "open" && prPanelLoading.open
                          }
                          className="flex-1 h-full! text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
                        >
                          <GitPullRequestCreate className="size-3.5" />
                          <span>{t("common.open")}</span>
                        </RefreshableTabsTab>
                        <RefreshableTabsTab
                          value="closed"
                          activeValue={prSubTab}
                          refreshTitle={t("rightSidebar.pr.refreshClosedPullRequests")}
                          onRefresh={() => prPanelRef.current?.refreshClosed()}
                          isRefreshing={
                            prSubTab === "closed" && prPanelLoading.closed
                          }
                          className="flex-1 h-full! text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
                        >
                          <GitPullRequestClosed className="size-3.5" />
                          <span>{t("common.closed")}</span>
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
                      enabled={activeTab === "pr"}
                    />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 py-10">
                  <GitPullRequest className="size-8 opacity-20 mb-2" />
                  <span className="text-xs text-center">
                    {t("rightSidebar.notAGitHubRepository")}
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
                    enabled={activeTab === "actions"}
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
                    {t("rightSidebar.notAGitHubRepository")}
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
            {activeTab !== "review" ? null : hasWorkingContext ? (
              <ReviewContextProvider
                target={reviewTarget}
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
              workspaceId={workspaceId ?? null}
              projectId={runPreviewProjectId ?? undefined}
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
