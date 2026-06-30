"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useGitLog } from "@/features/github/hooks/use-github";
import type { GitChangedFile, GitStatusResponse } from "@/api/ws-api";
import type { ChangesDiffScope } from "@/app-shell/sidebar/ChangesScopeMenu";

interface ChangesScopeState {
  key: string;
  scope: ChangesDiffScope;
  selectedCommitHash: string | null;
  menuOpen: boolean;
}

interface UseRightSidebarChangesScopeArgs {
  currentProjectPath: string | null | undefined;
  currentBranch: string | null | undefined;
  hasWorkingContext: boolean;
  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
  compareFiles: GitChangedFile[];
  compareRef: string | null;
  gitStatus: GitStatusResponse | null;
  resetCompareMode: () => void;
  refreshRepositoryState: (options?: { fetchRemote?: boolean }) => Promise<void>;
  compareAgainstRef: (baseRef: string) => Promise<void>;
  compareWorktreeChanges: () => Promise<void>;
  onVisitCommits: () => void;
}

function defaultChangesScopeState(key: string): ChangesScopeState {
  return {
    key,
    scope: "branch",
    selectedCommitHash: null,
    menuOpen: false,
  };
}

export function useRightSidebarChangesScope({
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
  onVisitCommits,
}: UseRightSidebarChangesScopeArgs) {
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
    if (hasWorkingContext) {
      void refreshRepositoryState({ fetchRemote: true });
    }
  }, [changesScopeKey, hasWorkingContext, refreshRepositoryState, resetCompareMode]);

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

  const selectedCommitLabel =
    selectedCommit?.short_hash ?? selectedCommitHash?.slice(0, 7) ?? null;
  const emptyCompareLabel = changesScope === "commit" ? null : compareRef;
  const hasDisplayedChanges =
    changesScope === "branch" || changesScope === "commit"
      ? compareFiles.length > 0
      : changesScope === "staged"
        ? stagedFiles.length > 0
        : unstagedFiles.length > 0 || untrackedFiles.length > 0;

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
        void refreshRepositoryState({ fetchRemote: true });
        return;
      }

      void compareWorktreeChanges();
    },
    [changesScopeKey, compareWorktreeChanges, refreshRepositoryState, resetCompareMode],
  );

  const handleSelectCommitScope = useCallback(
    (commitHash: string) => {
      setChangesScopeState({
        key: changesScopeKey,
        scope: "commit",
        selectedCommitHash: commitHash,
        menuOpen: false,
      });
      onVisitCommits();
      void compareAgainstRef(commitHash);
    },
    [changesScopeKey, compareAgainstRef, onVisitCommits],
  );

  const handleChangesRefresh = useCallback(async () => {
    if (changesScope === "commit" && selectedCommitHash) {
      await compareAgainstRef(selectedCommitHash);
      return;
    }

    if (changesScope === "staged" || changesScope === "unstaged") {
      await compareWorktreeChanges();
      return;
    }

    resetCompareMode();
    await refreshRepositoryState({ fetchRemote: true });
  }, [
    changesScope,
    compareAgainstRef,
    compareWorktreeChanges,
    refreshRepositoryState,
    resetCompareMode,
    selectedCommitHash,
  ]);

  return {
    changesScope,
    selectedCommitHash,
    selectedCommitLabel,
    emptyCompareLabel,
    changesScopeMenuOpen,
    setChangesScopeMenuOpen,
    commitLog,
    displayedComparedFiles: compareFiles,
    displayedStagedFiles: stagedFiles,
    displayedUnstagedFiles: unstagedFiles,
    displayedUntrackedFiles: untrackedFiles,
    hasDisplayedChanges,
    defaultBranchFallback:
      changesScope === "branch" && !compareRef ? gitStatus?.default_branch ?? null : null,
    handleSelectChangesScope,
    handleSelectCommitScope,
    handleChangesRefresh,
  };
}
