"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Check } from "@workspace/ui";

import type { GitChangedFile } from "@/api/ws-api";
import {
  DIFF_GROUP_TAB_LABELS,
  type DiffChangeGroupKind,
} from "@/features/diff/lib/diff-editor-paths";
import {
  ChangesToolbar,
  type ChangesDiffScope,
} from "@/app-shell/sidebar/ChangesToolbar";
import { createCanvasCenterTab } from "@/features/canvas/lib/canvas-center-tabs";
import {
  getCanvasContextId,
  type CanvasWidgetShape,
  type CanvasWidgetSourceRef,
} from "@/features/canvas/lib/canvas-widget-shape";
import { useOpenCanvasCenterTab } from "@/features/canvas/hooks/use-open-canvas-center-tab";
import { ChangeSection } from "@/app-shell/sidebar/ChangeSection";
import { useGitStore } from "@/features/git/store/use-git-store";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import { useGitChangedFilesQuery, invalidateGitQueries, GIT_WORKTREE_PARAMS } from "@/features/git/hooks/use-git-changed-files-query";
import { computeCompareParams, selectCompareChangedFiles, isCompareQueryEnabled, EMPTY_CHANGED_FILES, collectStageAllPaths } from "@/features/git/lib/git-query-options";
import { useSidebarUiPrefs } from "@/shared/stores/use-ui-pref-hooks";
import { type TLShapeId } from "tldraw";

type CanvasChangesWidgetSource = Extract<CanvasWidgetSourceRef, { type: "changes" }>;

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

export function CanvasChangesWidget({ shape }: { shape: CanvasWidgetShape }) {
  const source = shape.props.source;
  if (source.type !== "changes") {
    return null;
  }
  return <CanvasChangesWidgetBody shapeId={shape.id as TLShapeId} source={source} />;
}

function CanvasChangesWidgetBody({
  shapeId,
  source,
}: {
  shapeId: TLShapeId;
  source: CanvasChangesWidgetSource;
}) {
  const t = useTranslations("canvas.changesWidget");
  const repoPath = source.context.repoPath ?? source.context.localPath;
  const contextId = getCanvasContextId(source.context);
  const [selectedFilePath, setSelectedFilePath] = React.useState<string | null>(null);
  const [sidebarUi] = useSidebarUiPrefs();
  const viewMode = sidebarUi.changesFileViewMode;
  const openCenterTab = useOpenCanvasCenterTab(shapeId, source.context);
  const {
    compareMode,
    compareBaseRef,
    compareAgainstRef,
    compareWorktreeChanges,
    resetCompareMode,
    setCurrentRepoPath,
    stageFiles,
    unstageFiles,
    discardUnstagedChanges,
    discardUntrackedFiles,
    isLoading: isMutating,
  } = useGitStore();

  const statusQuery = useGitStatusQuery(repoPath ?? null);
  const currentBranch = statusQuery.data?.current_branch ?? null;
  const defaultBranch = statusQuery.data?.default_branch ?? null;
  const compareParams = computeCompareParams(compareMode, defaultBranch, compareBaseRef);

  const worktreeQuery = useGitChangedFilesQuery(repoPath ?? null, GIT_WORKTREE_PARAMS);
  const compareQuery = useGitChangedFilesQuery(
    isCompareQueryEnabled(compareMode, defaultBranch) ? (repoPath ?? null) : null,
    compareParams,
  );

  const stagedFiles = worktreeQuery.data?.staged_files ?? EMPTY_CHANGED_FILES;
  const unstagedFiles = worktreeQuery.data?.unstaged_files ?? EMPTY_CHANGED_FILES;
  const untrackedFiles = worktreeQuery.data?.untracked_files ?? EMPTY_CHANGED_FILES;
  const { files: compareFiles } = selectCompareChangedFiles(compareQuery.data);
  const isLoading = worktreeQuery.isFetching || compareQuery.isFetching;

  const changesScopeKey = `${repoPath ?? ""}:${currentBranch ?? ""}`;
  const [changesScopeState, setChangesScopeState] = React.useState<ChangesScopeState>(
    () => defaultChangesScopeState(changesScopeKey),
  );
  const activeChangesScopeState =
    changesScopeState.key === changesScopeKey
      ? changesScopeState
      : defaultChangesScopeState(changesScopeKey);
  const changesScope = activeChangesScopeState.scope;
  const selectedCommitHash = activeChangesScopeState.selectedCommitHash;
  const changesScopeMenuOpen = activeChangesScopeState.menuOpen;

  React.useEffect(() => {
    setCurrentRepoPath(repoPath || null);
    resetCompareMode();
    if (repoPath) {
      void invalidateGitQueries(repoPath);
    }
  }, [changesScopeKey, repoPath, resetCompareMode, setCurrentRepoPath]);

  const setChangesScopeMenuOpen = React.useCallback(
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

  const handleSelectChangesScope = React.useCallback(
    (scope: Exclude<ChangesDiffScope, "commit">) => {
      setChangesScopeState({
        key: changesScopeKey,
        scope,
        selectedCommitHash: null,
        menuOpen: false,
      });

      if (scope === "branch") {
        resetCompareMode();
        if (repoPath) void invalidateGitQueries(repoPath);
        return;
      }

      void compareWorktreeChanges();
    },
    [changesScopeKey, compareWorktreeChanges, repoPath, resetCompareMode],
  );

  const handleSelectCommitScope = React.useCallback(
    (commitHash: string) => {
      const trimmed = commitHash.trim();
      if (!trimmed) return;
      setChangesScopeState({
        key: changesScopeKey,
        scope: "commit",
        selectedCommitHash: trimmed,
        menuOpen: false,
      });
      void compareAgainstRef(trimmed);
    },
    [changesScopeKey, compareAgainstRef],
  );

  const displayedComparedFiles = compareFiles;
  const displayedStagedFiles = stagedFiles;
  const displayedUnstagedFiles = unstagedFiles;
  const displayedUntrackedFiles = untrackedFiles;
  const stageAllChanges = React.useCallback(
    async () => {
      await stageFiles(collectStageAllPaths(displayedUnstagedFiles, displayedUntrackedFiles));
    },
    [displayedUnstagedFiles, displayedUntrackedFiles, stageFiles],
  );
  const unstageAllChanges = React.useCallback(
    async () => {
      await unstageFiles(displayedStagedFiles.map((file) => file.path));
    },
    [displayedStagedFiles, unstageFiles],
  );
  const discardAllTrackedChanges = React.useCallback(
    async () => {
      await discardUnstagedChanges(displayedUnstagedFiles.map((file) => file.path));
    },
    [discardUnstagedChanges, displayedUnstagedFiles],
  );
  const trashAllUntrackedFiles = React.useCallback(
    async () => {
      await discardUntrackedFiles(displayedUntrackedFiles.map((file) => file.path));
    },
    [discardUntrackedFiles, displayedUntrackedFiles],
  );
  const hasDisplayedChanges =
    changesScope === "branch" || changesScope === "commit"
      ? displayedComparedFiles.length > 0
      : changesScope === "staged"
        ? displayedStagedFiles.length > 0
        : displayedUnstagedFiles.length > 0 || displayedUntrackedFiles.length > 0;
  const selectedPathForSection = React.useCallback(
    (files: GitChangedFile[]) =>
      files.some((file) => file.path === selectedFilePath) ? selectedFilePath : null,
    [selectedFilePath],
  );

  const openDiffFile = React.useCallback(
    ({
      kind,
      groupPath,
      filePath,
    }: {
      kind: DiffChangeGroupKind;
      groupPath: string;
      filePath: string;
      preview: boolean;
    }) => {
      if (
        kind === "compared" ||
        !repoPath
      ) {
        return;
      }
      setSelectedFilePath(filePath);
      openCenterTab(
        createCanvasCenterTab({
          kind: "changes-group",
          title: DIFF_GROUP_TAB_LABELS[kind as DiffChangeGroupKind],
          repoPath,
          groupPath,
          diffFilePath: filePath,
        }),
      );
    },
    [openCenterTab, repoPath],
  );

  if (!repoPath) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {t("noRepositoryPath")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 bg-background/50 backdrop-blur-sm">
        <ChangesToolbar
          scope={changesScope}
          selectedCommitHash={selectedCommitHash}
          stagedCount={displayedStagedFiles.length}
          unstagedCount={displayedUnstagedFiles.length}
          untrackedCount={displayedUntrackedFiles.length}
          open={changesScopeMenuOpen}
          isBusy={isMutating}
          repoPath={repoPath}
          branchKey={currentBranch}
          onOpenChange={setChangesScopeMenuOpen}
          onSelectScope={handleSelectChangesScope}
          onSelectCommit={handleSelectCommitScope}
          onStageAll={stageAllChanges}
          onUnstageAll={unstageAllChanges}
          onDiscardTracked={discardAllTrackedChanges}
          onTrashUntracked={trashAllUntrackedFiles}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading && !hasDisplayedChanges ? (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            {t("loading")}
          </div>
        ) : !hasDisplayedChanges ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground/50">
            <Check className="mb-2 size-8 opacity-20" />
            <span className="text-xs">{t("empty")}</span>
          </div>
        ) : changesScope === "branch" || changesScope === "commit" ? (
          <ChangeSection
            kind={changesScope === "commit" ? "commit" : "branch"}
            title={DIFF_GROUP_TAB_LABELS[changesScope === "commit" ? "commit" : "branch"]}
            files={displayedComparedFiles}
            workspaceId={contextId}
            viewMode={viewMode}
            selectedFilePath={selectedPathForSection(displayedComparedFiles)}
            onOpenDiffFile={openDiffFile}
          />
        ) : changesScope === "staged" ? (
          <ChangeSection
            kind="staged"
            title={t("sections.staged")}
            files={displayedStagedFiles}
            workspaceId={contextId}
            viewMode={viewMode}
            selectedFilePath={selectedPathForSection(displayedStagedFiles)}
            onOpenDiffFile={openDiffFile}
            onUnstage={unstageFiles}
            onUnstageAll={() => unstageFiles(displayedStagedFiles.map((file) => file.path))}
          />
        ) : (
          <>
            <ChangeSection
              kind="unstaged"
              title={t("sections.unstaged")}
              files={displayedUnstagedFiles}
              workspaceId={contextId}
              viewMode={viewMode}
              selectedFilePath={selectedPathForSection(displayedUnstagedFiles)}
              onOpenDiffFile={openDiffFile}
              onStage={stageFiles}
              onDiscard={discardUnstagedChanges}
              onStageAll={() => stageFiles(displayedUnstagedFiles.map((file) => file.path))}
              onDiscardAll={() => discardUnstagedChanges(displayedUnstagedFiles.map((file) => file.path))}
            />
            <ChangeSection
              kind="untracked"
              title={t("sections.untracked")}
              files={displayedUntrackedFiles}
              workspaceId={contextId}
              viewMode={viewMode}
              selectedFilePath={selectedPathForSection(displayedUntrackedFiles)}
              onOpenDiffFile={openDiffFile}
              onStage={stageFiles}
              onDiscard={discardUntrackedFiles}
              onStageAll={() => stageFiles(displayedUntrackedFiles.map((file) => file.path))}
              onDiscardAll={() => discardUntrackedFiles(displayedUntrackedFiles.map((file) => file.path))}
            />
          </>
        )}
      </div>
    </div>
  );
}
