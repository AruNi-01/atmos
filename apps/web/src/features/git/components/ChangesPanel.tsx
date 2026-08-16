"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Button } from "@workspace/ui";
import { FileDiff, FolderOpen, GitBranch } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useGitStore } from "@/features/git/store/use-git-store";
import {
  useGitChangedFilesQuery,
  invalidateGitQueries,
  GIT_WORKTREE_PARAMS,
} from "@/features/git/hooks/use-git-changed-files-query";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import {
  computeCompareParams,
  selectCompareChangedFiles,
  isCompareQueryEnabled,
  EMPTY_CHANGED_FILES,
  collectStageAllPaths,
} from "@/features/git/lib/git-query-options";
import { useOpenGitHistoryCenterTab } from "@/features/git/hooks/use-open-git-history-center-tab";
import { useGitHistoryCenterTabStore } from "@/features/git/store/use-git-history-center-tab";
import type { GitChangedFile } from "@/api/ws-api";
import { useSidebarUiPrefs } from "@/shared/stores/use-ui-pref-hooks";
import { ChangeSection } from "@/app-shell/sidebar/ChangeSection";
import {
  ChangesToolbar,
  type ChangesDiffScope,
} from "@/app-shell/sidebar/ChangesToolbar";
import { CommitActionsContainer } from "@/app-shell/sidebar/CommitActionsContainer";
import type { Project, Workspace } from "@/shared/types/domain";

function sumChangeCounts(files: GitChangedFile[]) {
  return files.reduce(
    (totals, file) => ({
      additions: totals.additions + file.additions,
      deletions: totals.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}

interface ChangesScopeState {
  key: string;
  scope: ChangesDiffScope;
  selectedCommitHash: string | null;
  menuOpen: boolean;
  autoSelectScope: boolean;
}

function defaultChangesScopeState(key: string): ChangesScopeState {
  return {
    key,
    scope: "branch",
    selectedCommitHash: null,
    menuOpen: false,
    autoSelectScope: true,
  };
}

export function ChangesPanel({
  contextId,
  currentProject,
  currentProjectPath,
  currentWorkspace,
  projectId,
  workspaceId,
}: {
  contextId: string | null;
  currentProject?: Project;
  currentProjectPath: string | null;
  currentWorkspace?: Workspace;
  projectId: string | null;
  workspaceId: string | null;
}) {
  const t = useTranslations("AppShell.chrome");
  const { openGitHistoryTab } = useOpenGitHistoryCenterTab();
  const selectHistoryCommit = useGitHistoryCenterTabStore((s) => s.selectCommit);
  const [sidebarUi] = useSidebarUiPrefs();
  const changesFileViewMode = sidebarUi.changesFileViewMode;

  const {
    compareMode,
    compareBaseRef,
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
    compareWorktreeChanges,
    resetCompareMode,
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
  const preferredChangesScope: Exclude<ChangesDiffScope, "commit"> =
    unstagedFiles.length > 0 || untrackedFiles.length > 0
      ? "unstaged"
      : stagedFiles.length > 0
        ? "staged"
        : "branch";
  const { files: compareFiles, compareRef } = selectCompareChangedFiles(compareQuery.data);
  const { files: branchRecommendationFiles } = selectCompareChangedFiles(
    branchRecommendationQuery.data,
  );
  const gitStatus = statusQuery.data ?? null;
  const isLoading =
    isMutating ||
    worktreeQuery.isLoading ||
    (isCompareQueryEnabled(compareMode, defaultBranch) && compareQuery.isLoading);

  const currentBranch = statusQuery.data?.current_branch ?? null;
  const changesScopeKey = `${currentProjectPath ?? ""}:${currentBranch ?? ""}`;
  const [changesScopeState, setChangesScopeState] = useState<ChangesScopeState>(
    () => defaultChangesScopeState(changesScopeKey),
  );
  const activeChangesScopeState =
    changesScopeState.key === changesScopeKey
      ? changesScopeState
      : defaultChangesScopeState(changesScopeKey);
  const changesScope = activeChangesScopeState.autoSelectScope
    ? preferredChangesScope
    : activeChangesScopeState.scope;
  const selectedCommitHash = activeChangesScopeState.selectedCommitHash;
  const changesScopeMenuOpen = activeChangesScopeState.menuOpen;

  useEffect(() => {
    resetCompareMode();
    if (contextId) selectHistoryCommit(contextId, null);
    if (currentProjectPath) {
      void invalidateGitQueries(currentProjectPath);
    }
  }, [changesScopeKey, contextId, currentProjectPath, resetCompareMode, selectHistoryCommit]);

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

  const displayedComparedFiles = compareFiles;
  const displayedStagedFiles = stagedFiles;
  const displayedUnstagedFiles = unstagedFiles;
  const displayedUntrackedFiles = untrackedFiles;
  const selectedCommitLabel = selectedCommitHash?.slice(0, 7) ?? null;
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
      branchRecommendationQuery.isLoading);

  const handleSelectChangesScope = useCallback(
    (scope: Exclude<ChangesDiffScope, "commit">) => {
      setChangesScopeState({
        key: changesScopeKey,
        scope,
        selectedCommitHash: null,
        menuOpen: false,
        autoSelectScope: false,
      });
      if (contextId) selectHistoryCommit(contextId, null);

      if (scope === "branch") {
        resetCompareMode();
        if (currentProjectPath) void invalidateGitQueries(currentProjectPath);
        return;
      }

      void compareWorktreeChanges();
    },
    [
      changesScopeKey,
      compareWorktreeChanges,
      contextId,
      currentProjectPath,
      resetCompareMode,
      selectHistoryCommit,
    ],
  );

  const stageAllUnstagedFn = useCallback(async () => {
    await stageAllUnstaged(unstagedFiles.map((f) => f.path));
  }, [stageAllUnstaged, unstagedFiles]);

  const stageAllUntrackedFn = useCallback(async () => {
    await stageAllUntracked(untrackedFiles.map((f) => f.path));
  }, [stageAllUntracked, untrackedFiles]);

  const stageAllChangesFn = useCallback(async () => {
    await stageFiles(collectStageAllPaths(unstagedFiles, untrackedFiles));
  }, [stageFiles, unstagedFiles, untrackedFiles]);

  const unstageAllFn = useCallback(async () => {
    await unstageAll(stagedFiles.map((f) => f.path));
  }, [unstageAll, stagedFiles]);

  const discardAllUnstagedFn = useCallback(async () => {
    await discardAllUnstaged(unstagedFiles.map((f) => f.path));
  }, [discardAllUnstaged, unstagedFiles]);

  const discardAllUntrackedFn = useCallback(async () => {
    await discardAllUntracked(untrackedFiles.map((f) => f.path));
  }, [discardAllUntracked, untrackedFiles]);

  if (!currentProjectPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground/50">
        <FolderOpen className="mb-2 size-8 opacity-20" />
        <span className="text-center text-xs">{t("changes.noContext")}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 bg-background/50 backdrop-blur-sm">
        <ChangesToolbar
          scope={changesScope}
          selectedCommitHash={selectedCommitHash}
          stagedCount={displayedStagedFiles.length}
          unstagedCount={displayedUnstagedFiles.length}
          untrackedCount={displayedUntrackedFiles.length}
          open={changesScopeMenuOpen}
          isBusy={isMutating}
          onOpenChange={setChangesScopeMenuOpen}
          onSelectScope={handleSelectChangesScope}
          onOpenHistory={() => openGitHistoryTab(selectedCommitHash)}
          onStageAll={stageAllChangesFn}
          onUnstageAll={unstageAllFn}
          onDiscardTracked={discardAllUnstagedFn}
          onTrashUntracked={discardAllUntrackedFn}
        />
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto p-2 no-scrollbar",
          !hasDisplayedChanges &&
            !isEmptyStateLoading &&
            "flex items-center justify-center",
        )}
      >
        <div>
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
                    ? t("changes.noCommitChanges", {
                        commit: selectedCommitLabel,
                      })
                    : emptyCompareLabel
                      ? t("changes.noChangesAgainst", {
                          compareRef: emptyCompareLabel,
                        })
                      : t("changes.noChangesDetected")}
                </span>
              </div>

              {changeScopeRecommendations.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {changeScopeRecommendations.map((recommendation) => {
                    const label =
                      recommendation.scope === "branch"
                        ? t("changes.branchChanges")
                        : recommendation.scope === "staged"
                          ? t("changes.stagedChanges")
                          : t("changes.unstagedChanges");
                    const ScopeIcon =
                      recommendation.scope === "branch" ? GitBranch : FileDiff;

                    return (
                      <button
                        key={recommendation.scope}
                        type="button"
                        onClick={() => handleSelectChangesScope(recommendation.scope)}
                        className="group flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-sidebar-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  {t("changes.compareWithDefaultBranch", {
                    branch: gitStatus.default_branch,
                  })}
                </Button>
              ) : null}
            </div>
          ) : changesScope === "branch" || changesScope === "commit" ? (
            <ChangeSection
              kind={changesScope === "commit" ? "commit" : "branch"}
              title={
                changesScope === "commit" && selectedCommitLabel
                  ? t("changes.commitChanges", {
                      commit: selectedCommitLabel,
                    })
                  : t("changes.branchChanges")
              }
              files={displayedComparedFiles}
              workspaceId={workspaceId}
              contextId={contextId}
              viewMode={changesFileViewMode}
              hideHeader
            />
          ) : changesScope === "staged" ? (
            <ChangeSection
              kind="staged"
              title={t("changes.stagedChanges")}
              files={displayedStagedFiles}
              workspaceId={workspaceId}
              contextId={contextId}
              viewMode={changesFileViewMode}
              hideHeader
              onUnstage={unstageFiles}
              onUnstageAll={unstageAllFn}
            />
          ) : (
            <>
              <ChangeSection
                kind="unstaged"
                title={t("changes.unstagedChanges")}
                files={displayedUnstagedFiles}
                workspaceId={workspaceId}
                contextId={contextId}
                viewMode={changesFileViewMode}
                hideHeader
                onStage={stageFiles}
                onDiscard={discardUnstagedChanges}
                onStageAll={stageAllUnstagedFn}
                onDiscardAll={discardAllUnstagedFn}
              />
              <ChangeSection
                kind="untracked"
                title={t("changes.untrackedChanges")}
                files={displayedUntrackedFiles}
                workspaceId={workspaceId}
                contextId={contextId}
                viewMode={changesFileViewMode}
                hideHeader
                onStage={stageFiles}
                onDiscard={discardUntrackedFiles}
                onStageAll={stageAllUntrackedFn}
                onDiscardAll={discardAllUntrackedFn}
              />
            </>
          )}
        </div>
      </div>

      <CommitActionsContainer
        currentProjectPath={currentProjectPath}
        currentProject={currentProject}
        currentWorkspace={currentWorkspace}
        workspaceId={workspaceId}
        projectId={projectId}
      />
    </div>
  );
}
