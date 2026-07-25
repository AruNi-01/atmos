"use client";

import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { useGitStore } from "@/features/git/store/use-git-store";
import { useGitChangedFilesQuery, invalidateGitQueries, GIT_WORKTREE_PARAMS } from "@/features/git/hooks/use-git-changed-files-query";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import { computeCompareParams, selectCompareChangedFiles, isCompareQueryEnabled, EMPTY_CHANGED_FILES } from "@/features/git/lib/git-query-options";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useProjectStore } from "@/features/project/store/use-project-store";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import {
  Check,
  Button,
  Tabs,
  TabsList,
  TabsTab,
} from "@workspace/ui";
import {
  Play,
  Globe,
  GitPullRequest,
  GitPullRequestCreate,
  GitPullRequestClosed,
  GitBranch,
  GitCommit as GitCommitIcon,
  FileDiff,
  FolderOpen,
  FolderTree,
  Workflow,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useQueryStates } from "nuqs";
import {
  centerStageParams,
  rightSidebarParams,
  rightSidebarDialogParams,
  type RightSidebarTab,
} from "@/shared/lib/nuqs/searchParams";
import { useContextParams } from "@/shared/hooks/use-context-params";
import type { ActionRun } from "@/features/github/components/ActionsPanel";
import dynamic from "next/dynamic";
import { PRPanel, type PRPanelHandle } from "@/features/github/components/PRPanel";
import { CommitsPanel } from "@/features/github/components/CommitsPanel";
import { ActionsPanel } from "@/features/github/components/ActionsPanel";
import { useGitLog } from "@/features/github/hooks/use-github";
import { isWorkspaceSetupBlocking } from "@/features/workspace/lib/workspace-setup";
import { useLayoutSettingsStore } from "@/features/settings/store/layout-settings-store";
import { FileTreePanel } from "@/features/files/components/FileTreePanel";
import { scheduleAfterPaint } from "@/app-shell/workspace-surface-switch";

import { ChangeSection } from "@/app-shell/sidebar/ChangeSection";
import {
  ChangesToolbar,
  type ChangesDiffScope,
} from "@/app-shell/sidebar/ChangesToolbar";
import { CommitActionsContainer } from "@/app-shell/sidebar/CommitActionsContainer";
import { RightSidebarCreatePrDialog } from "@/app-shell/sidebar/RightSidebarCreatePrDialog";
import { ReviewContextProvider } from "@/features/diff/components/review/ReviewContextProvider";
import type { GitChangedFile, ReviewTarget } from "@/api/ws-api";
import { ReviewActions } from "@/features/diff/components/review/ReviewActions";
import { RefreshableTabsTab } from "@/shared/components/ui/RefreshableTabsTab";
import { useSidebarUiPrefs } from "@/shared/stores/use-ui-pref-hooks";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import { useSidebarLayout } from "@/app-shell/SidebarLayoutContext";

function sumChangeCounts(files: GitChangedFile[]) {
  return files.reduce(
    (totals, file) => ({
      additions: totals.additions + file.additions,
      deletions: totals.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}

const AgentChatPanel = dynamic(
  () => import("@/features/agent/components/AgentChatPanel").then((m) => m.AgentChatPanel),
  { ssr: false },
);
const BrowserPanel = dynamic(
  () =>
    import("@/features/run-preview/components/BrowserPanel").then(
      (m) => m.BrowserPanel,
    ),
  { ssr: false },
);
const RunScript = dynamic(
  () =>
    import("@/features/run-preview/components/RunScript").then(
      (m) => m.RunScript,
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
  { value: "browser", labelKey: "rightSidebar.topTabs.browser", Icon: Globe },
  { value: "run", labelKey: "rightSidebar.topTabs.run", Icon: Play },
  { value: "pr", labelKey: "rightSidebar.topTabs.pullRequests", Icon: GitPullRequest },
  { value: "actions", labelKey: "rightSidebar.topTabs.actions", Icon: Workflow },
];

const FILES_TAB = { value: "files" as RightSidebarTab, labelKey: "common.files", Icon: FolderTree };

function normalizePathForContainment(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

interface ChangesScopeState {
  key: string;
  scope: ChangesDiffScope;
  selectedCommitHash: string | null;
  menuOpen: boolean;
}

function defaultChangesScopeState(key: string): ChangesScopeState {
  return {
    key,
    scope: "branch",
    selectedCommitHash: null,
    menuOpen: false,
  };
}

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
  const { isRightCollapsed } = useSidebarLayout();
  const { workspaceId: liveWorkspaceId, projectId: liveProjectIdFromUrl } = useContextParams();
  // Defer heavy tree/changes rebind so CenterStage frame switch paints first.
  const workspaceId = useDeferredValue(liveWorkspaceId);
  const projectIdFromUrl = useDeferredValue(liveProjectIdFromUrl);
  // While deferred IDs lag the URL, keep showing prior context but do not run
  // interactive commands (git/run/browser/review) against a mismatched target.
  const isContextSettled =
    workspaceId === liveWorkspaceId && projectIdFromUrl === liveProjectIdFromUrl;
  const currentProjectPath = useEditorStore((s) => s.currentProjectPath);
  const fileTreeRevealTarget = useEditorStore((s) => s.fileTreeRevealTarget);
  const getActiveFilePath = useEditorStore((s) => s.getActiveFilePath);
  const contextId = workspaceId || projectIdFromUrl;
  const filePath = (contextId && getActiveFilePath(contextId)) || "";
  const projects = useProjects();
  // Layout settings
  const projectFilesSide = useLayoutSettingsStore((s) => s.projectFilesSide);
  const rsShowChanges = useLayoutSettingsStore((s) => s.rsShowChanges);
  const rsShowReview = useLayoutSettingsStore((s) => s.rsShowReview);
  const rsShowBrowser = useLayoutSettingsStore((s) => s.rsShowBrowser);
  const rsShowRun = useLayoutSettingsStore((s) => s.rsShowRun);
  const rsShowPr = useLayoutSettingsStore((s) => s.rsShowPr);
  const rsShowActions = useLayoutSettingsStore((s) => s.rsShowActions);
  const loadLayoutSettings = useLayoutSettingsStore((s) => s.loadSettings);
  useEffect(() => { loadLayoutSettings(); }, [loadLayoutSettings]);
  const showFilesTab = projectFilesSide === "right";
  const tabVisibility = useMemo<Record<RightSidebarTab, boolean>>(
    () => ({
      changes: rsShowChanges,
      review: rsShowReview,
      browser: rsShowBrowser,
      run: rsShowRun,
      pr: rsShowPr,
      actions: rsShowActions,
      files: true, // controlled separately by projectFilesSide
    }),
    [rsShowChanges, rsShowReview, rsShowBrowser, rsShowRun, rsShowPr, rsShowActions],
  );
  const topTabs = useMemo(() => {
    // Insert FILES_TAB into the canonical order first, then filter by
    // visibility. This keeps Files in its slot (right after Run's position)
    // even when Run itself is hidden.
    const runIdx = BASE_TABS.findIndex((t) => t.value === "run");
    const ordered = showFilesTab
      ? [...BASE_TABS.slice(0, runIdx + 1), FILES_TAB, ...BASE_TABS.slice(runIdx + 1)]
      : BASE_TABS;
    return ordered.filter((tab) => tabVisibility[tab.value]);
  }, [showFilesTab, tabVisibility]);

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
  const currentEffectivePath =
    currentWorkspace?.localPath ?? currentProject?.mainFilePath ?? null;
  const runProjectId = projectIdFromUrl ?? currentProject?.id ?? null;
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
    compareMode,
    compareBaseRef,
    setCurrentRepoPath,
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
    fetchChanges,
    isLoading: isMutating,
  } = useGitStore();

  const worktreeQuery = useGitChangedFilesQuery(currentProjectPath, GIT_WORKTREE_PARAMS);
  const statusQuery = useGitStatusQuery(currentProjectPath);
  const defaultBranch = statusQuery.data?.default_branch ?? null;
  const compareParams = computeCompareParams(compareMode, defaultBranch, compareBaseRef);
  const compareQuery = useGitChangedFilesQuery(
    isCompareQueryEnabled(compareMode, defaultBranch) ? currentProjectPath : null,
    compareParams,
  );
  const branchRecommendationQuery = useGitChangedFilesQuery(
    currentProjectPath,
    computeCompareParams("branch", defaultBranch, null),
  );

  const stagedFiles = worktreeQuery.data?.staged_files ?? EMPTY_CHANGED_FILES;
  const unstagedFiles = worktreeQuery.data?.unstaged_files ?? EMPTY_CHANGED_FILES;
  const untrackedFiles = worktreeQuery.data?.untracked_files ?? EMPTY_CHANGED_FILES;
  const { files: compareFiles, compareRef } = selectCompareChangedFiles(compareQuery.data);
  const { files: branchRecommendationFiles } = selectCompareChangedFiles(
    branchRecommendationQuery.data,
  );
  const gitStatus = statusQuery.data ?? null;
  const isLoading = isMutating || worktreeQuery.isFetching || compareQuery.isFetching;

  const [{ rsTab: activeTab }, setSidebarParams] =
    useQueryStates(rightSidebarParams);

  // If the active tab has been hidden via layout settings, fall back to the
  // first visible tab so the sidebar never shows an empty pane.
  useEffect(() => {
    const visibleValues = topTabs.map((tab) => tab.value);
    if (visibleValues.length === 0) return;
    if (!activeTab || !visibleValues.includes(activeTab)) {
      void setSidebarParams({ rsTab: visibleValues[0] });
    }
  }, [activeTab, topTabs, setSidebarParams]);
  const [{ tab: activeCenterTab, wikiPage: activeWikiPage }] =
    useQueryStates(centerStageParams);
  const [{ rsCreatePr }, setDialogParams] = useQueryStates(
    rightSidebarDialogParams,
  );
  const { openActionRunTab, openPullRequestTab } = useOpenGithubCenterTab();

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

  const githubOwner = statusQuery.data?.github_owner ?? null;
  const githubRepo = statusQuery.data?.github_repo ?? null;
  const currentBranch = statusQuery.data?.current_branch ?? null;

  // Repo path rebind after paint — do not block center-stage switch chrome.
  // Wait until deferred sidebar context matches the live URL so git mutations
  // never target the newly live path while the UI still shows the previous one.
  useEffect(() => {
    if (!isContextSettled) return;
    return scheduleAfterPaint(() => {
      if (isSettingUp) {
        setCurrentRepoPath(null);
        return;
      }
      setCurrentRepoPath(currentProjectPath || null);
    });
  }, [currentProjectPath, isContextSettled, isSettingUp, setCurrentRepoPath]);

  const hasWorkingContext = !!(
    !isSettingUp &&
    isContextSettled &&
    currentProjectPath &&
    (workspaceId || projectIdFromUrl)
  );

  useEffect(() => {
    if (!showFilesTab || !fileTreeRevealTarget || !currentEffectivePath) return;
    if (fileTreeRevealTarget.workspaceId && fileTreeRevealTarget.workspaceId !== contextId) {
      return;
    }

    const normalizedCurrentPath = normalizePathForContainment(currentEffectivePath);
    const normalizedRevealPath = normalizePathForContainment(fileTreeRevealTarget.path);
    if (
      normalizedRevealPath !== normalizedCurrentPath &&
      !normalizedRevealPath.startsWith(`${normalizedCurrentPath}/`)
    ) {
      return;
    }

    if (activeTab !== "files") {
      void setSidebarParams({ rsTab: "files" });
    }
  }, [
    activeTab,
    contextId,
    currentEffectivePath,
    fileTreeRevealTarget,
    setSidebarParams,
    showFilesTab,
  ]);

  const changesScopeKey = `${currentProjectPath ?? ""}:${currentBranch ?? ""}`;
  const [changesScopeState, setChangesScopeState] = useState<ChangesScopeState>(
    () => defaultChangesScopeState(changesScopeKey),
  );
  const activeChangesScopeState =
    changesScopeState.key === changesScopeKey
      ? changesScopeState
      : defaultChangesScopeState(changesScopeKey);
  const changesScope = activeChangesScopeState.scope;
  const selectedCommitHash = activeChangesScopeState.selectedCommitHash;
  const changesScopeMenuOpen = activeChangesScopeState.menuOpen;
  useEffect(() => {
    resetCompareMode();
    if (hasWorkingContext && currentProjectPath) {
      void invalidateGitQueries(currentProjectPath);
    }
  }, [changesScopeKey, hasWorkingContext, currentProjectPath, resetCompareMode]);
  const setChangesScopeMenuOpen = useCallback(
    (open: boolean) => {
      setChangesScopeState((current) => ({
        ...(current.key === changesScopeKey
          ? current
          : defaultChangesScopeState(changesScopeKey)),
        menuOpen: open,
      }));
    },
    [changesScopeKey],
  );

  const commitLog = useGitLog({
    repoPath: hasWorkingContext ? currentProjectPath ?? null : null,
    branchKey: hasWorkingContext ? currentBranch ?? null : null,
  });
  const selectedCommit = useMemo(
    () => commitLog.commits.find((commit) => commit.hash === selectedCommitHash),
    [commitLog.commits, selectedCommitHash],
  );

  const displayedComparedFiles = compareFiles;
  const displayedStagedFiles = stagedFiles;
  const displayedUnstagedFiles = unstagedFiles;
  const displayedUntrackedFiles = untrackedFiles;
  const selectedCommitLabel =
    selectedCommit?.short_hash ?? selectedCommitHash?.slice(0, 7) ?? null;
  const emptyCompareLabel = changesScope === "commit" ? null : compareRef;
  const hasDisplayedChanges =
    changesScope === "branch" || changesScope === "commit"
      ? displayedComparedFiles.length > 0
      : changesScope === "staged"
        ? displayedStagedFiles.length > 0
        : displayedUnstagedFiles.length > 0 || displayedUntrackedFiles.length > 0;
  const changeScopeRecommendations = useMemo(() => {
    if (changesScope === "commit") return [];

    const candidates: Array<{
      scope: Exclude<ChangesDiffScope, "commit">;
      files: GitChangedFile[];
    }> = [
      { scope: "branch", files: branchRecommendationFiles },
      { scope: "staged", files: displayedStagedFiles },
      {
        scope: "unstaged",
        files: [...displayedUnstagedFiles, ...displayedUntrackedFiles],
      },
    ];

    return candidates
      .filter(({ scope, files }) => scope !== changesScope && files.length > 0)
      .map(({ scope, files }) => ({
        scope,
        ...sumChangeCounts(files),
      }));
  }, [
    branchRecommendationFiles,
    changesScope,
    displayedStagedFiles,
    displayedUnstagedFiles,
    displayedUntrackedFiles,
  ]);
  const isEmptyStateLoading =
    isLoading ||
    (changesScope !== "branch" &&
      changesScope !== "commit" &&
      branchRecommendationQuery.isFetching);
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

  const handleSelectChangesScope = useCallback(
    (scope: Exclude<ChangesDiffScope, "commit">) => {
      setChangesScopeState({
        key: changesScopeKey,
        scope,
        selectedCommitHash: null,
        menuOpen: false,
      });

      if (scope === "branch") {
        resetCompareMode();
        if (currentProjectPath) void invalidateGitQueries(currentProjectPath);
        return;
      }

      void compareWorktreeChanges();
    },
    [changesScopeKey, compareWorktreeChanges, currentProjectPath, resetCompareMode],
  );

  const handleSelectCommitScope = useCallback(
    (commitHash: string) => {
      setChangesScopeState({
        key: changesScopeKey,
        scope: "commit",
        selectedCommitHash: commitHash,
        menuOpen: false,
      });
      setHasVisitedCommits(true);
      void compareAgainstRef(commitHash);
    },
    [changesScopeKey, compareAgainstRef],
  );

  const handleChangesRefresh = useCallback(async () => {
    if (changesScope === "commit" && selectedCommitHash) {
      await compareAgainstRef(selectedCommitHash);
      return;
    }

    if (changesScope === "staged" || changesScope === "unstaged") {
      await compareWorktreeChanges();
      if (currentProjectPath) await invalidateGitQueries(currentProjectPath);
      return;
    }

    resetCompareMode();
    await fetchChanges();
  }, [
    changesScope,
    compareAgainstRef,
    compareWorktreeChanges,
    currentProjectPath,
    fetchChanges,
    resetCompareMode,
    selectedCommitHash,
  ]);

  const stageAllUnstagedFn = useCallback(async () => {
    await stageAllUnstaged(unstagedFiles.map((f) => f.path));
  }, [stageAllUnstaged, unstagedFiles]);

  const stageAllUntrackedFn = useCallback(async () => {
    await stageAllUntracked(untrackedFiles.map((f) => f.path));
  }, [stageAllUntracked, untrackedFiles]);

  const unstageAllFn = useCallback(async () => {
    await unstageAll(stagedFiles.map((f) => f.path));
  }, [unstageAll, stagedFiles]);

  const discardAllUnstagedFn = useCallback(async () => {
    await discardAllUnstaged(unstagedFiles.map((f) => f.path));
  }, [discardAllUnstaged, unstagedFiles]);

  const discardAllUntrackedFn = useCallback(async () => {
    await discardAllUntracked(untrackedFiles.map((f) => f.path));
  }, [discardAllUntracked, untrackedFiles]);

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
              <FileTreePanel
                projectName={currentProject?.name}
                revealEnabled={activeTab === "files"}
              />
            </div>
          )}

          {/* Changes tab content */}
          {rsShowChanges && (
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
                      <ChangesToolbar
                        value="changes"
                        activeValue={changesSubTab}
                        onRefresh={handleChangesRefresh}
                        isRefreshing={changesSubTab === "changes" && isLoading}
                        scope={changesScope}
                        selectedCommitHash={selectedCommitHash}
                        commits={commitLog.commits}
                        loadingCommits={commitLog.loading}
                        stagedCount={displayedStagedFiles.length}
                        unstagedCount={
                          displayedUnstagedFiles.length + displayedUntrackedFiles.length
                        }
                        open={changesScopeMenuOpen}
                        viewMode={changesFileViewMode}
                        onOpenChange={setChangesScopeMenuOpen}
                        onSelectScope={handleSelectChangesScope}
                        onSelectCommit={handleSelectCommitScope}
                        onToggleViewMode={() =>
                          setChangesFileViewMode(
                            changesFileViewMode === "tree" ? "list" : "tree",
                          )
                        }
                        className="h-full! basis-2/3 flex-[2_1_0%] text-sm gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none border-0!"
                      />
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
                      !isEmptyStateLoading &&
                      "flex items-center justify-center",
                  )}
                >
                  <div className={cn(changesSubTab === "commits" && "hidden")}>
                    {!hasDisplayedChanges && !isEmptyStateLoading ? (
                      <div
                        className={cn(
                          "flex min-h-40 w-full flex-col justify-center gap-2",
                          changeScopeRecommendations.length > 0
                            ? "px-1"
                            : "items-center text-muted-foreground/50",
                        )}
                      >
                        <div
                          className={cn(
                            "flex gap-2",
                            changeScopeRecommendations.length > 0
                              ? "items-center px-2 text-muted-foreground/60"
                              : "flex-col items-center",
                          )}
                        >
                          {changeScopeRecommendations.length === 0 ? (
                            <Check className="mb-2 size-8 opacity-20" />
                          ) : null}
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
                        </div>

                        {changeScopeRecommendations.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {changeScopeRecommendations.map((recommendation) => {
                              const label =
                                recommendation.scope === "branch"
                                  ? t("rightSidebar.changes.branchChanges")
                                  : recommendation.scope === "staged"
                                    ? t("rightSidebar.changes.stagedChanges")
                                    : t("rightSidebar.changes.unstagedChanges");
                              const ScopeIcon =
                                recommendation.scope === "branch" ? GitBranch : FileDiff;

                              return (
                                <button
                                  key={recommendation.scope}
                                  type="button"
                                  onClick={() =>
                                    handleSelectChangesScope(recommendation.scope)
                                  }
                                  className="group flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors duration-200 hover:bg-sidebar-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                  <ScopeIcon className="size-3.5 shrink-0 text-muted-foreground/70 group-hover:text-foreground" />
                                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground group-hover:text-foreground">
                                    {label}
                                  </span>
                                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-medium tabular-nums">
                                    {recommendation.additions > 0 ? (
                                      <span className="text-emerald-500">
                                        +{recommendation.additions}
                                      </span>
                                    ) : null}
                                    {recommendation.deletions > 0 ? (
                                      <span className="text-red-500">
                                        -{recommendation.deletions}
                                      </span>
                                    ) : null}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        {changesScope === "branch" && !compareRef && gitStatus?.default_branch ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 self-center px-2 text-[11px]"
                            onClick={() => {
                              void compareAgainstDefaultBranch();
                            }}
                          >
                            {t("rightSidebar.changes.compareWithDefaultBranch", {
                              branch: gitStatus.default_branch,
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
                          onUnstageAll={unstageAllFn}
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
                            onStageAll={stageAllUnstagedFn}
                            onDiscardAll={discardAllUnstagedFn}
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
                            onStageAll={stageAllUntrackedFn}
                            onDiscardAll={discardAllUntrackedFn}
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
          )}

          {/* PR tab content */}
          {rsShowPr && (
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
                      onPrClick={(prNumber, prTitle) =>
                        openPullRequestTab({
                          branch: currentBranch,
                          owner: githubOwner,
                          prNumber,
                          repo: githubRepo,
                          title: prTitle,
                        })
                      }
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
          )}

          {/* Actions tab content */}
          {rsShowActions && (
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
                    onRunClick={(run: ActionRun) =>
                      openActionRunTab({
                        owner: githubOwner,
                        repo: githubRepo,
                        run,
                      })
                    }
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
          )}

          {/* Review tab content */}
          {rsShowReview && (
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
          )}

          {/* Browser tab content */}
          {rsShowBrowser && (
          <div
            className={cn(
              "flex-1 min-h-0",
              activeTab !== "browser" && "hidden",
            )}
          >
            <BrowserPanel
              workspaceId={workspaceId ?? null}
              projectId={runProjectId ?? undefined}
              // When the right sidebar is collapsed, keep the panel mounted but
              // inactive so its native child webview does not cover center stage.
              // Also stay inactive while deferred context lags the live URL.
              isActive={
                activeTab === "browser" && !isRightCollapsed && isContextSettled
              }
              allowMoveToCenter
            />
          </div>
          )}

          {/* Run tab content */}
          {rsShowRun && (
          <div
            className={cn(
              "flex-1 min-h-0",
              activeTab !== "run" && "hidden",
            )}
          >
            <RunScript
              workspaceId={workspaceId ?? null}
              projectId={runProjectId ?? undefined}
              isActive={activeTab === "run" && isContextSettled}
              projectName={currentProject?.name}
              workspaceName={currentWorkspace?.name}
            />
          </div>
          )}
        </Tabs>

        <RightSidebarCreatePrDialog
          githubOwner={githubOwner}
          githubRepo={githubRepo}
          currentBranch={currentBranch}
          rsCreatePr={!!rsCreatePr}
          onCloseCreatePr={() => setDialogParams({ rsCreatePr: false })}
          onPrCreated={() => prPanelRef.current?.refreshOpen()}
        />
      </div>
    </aside>
  );
};

export default RightSidebar;
