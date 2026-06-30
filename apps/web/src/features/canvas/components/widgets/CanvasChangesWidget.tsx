"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Check, Tabs, TabsList } from "@workspace/ui";

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
import { useGitInfoStore } from "@/features/git/store/use-git-info-store";
import { useGitLog } from "@/features/github/hooks/use-github";
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
  const [sidebarUi, setSidebarUi] = useSidebarUiPrefs();
  const viewMode = sidebarUi.changesFileViewMode;
  const setViewMode = (mode: "list" | "tree") =>
    setSidebarUi({ changesFileViewMode: mode });
  const openCenterTab = useOpenCanvasCenterTab(shapeId, source.context);
  const {
    compareAgainstRef,
    compareFiles,
    compareWorktreeChanges,
    isLoading,
    refreshRepositoryState,
    resetCompareMode,
    setCurrentRepoPath,
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    stageFiles,
    unstageFiles,
    discardUnstagedChanges,
    discardUntrackedFiles,
  } = useGitStore();
  const currentBranch = useGitInfoStore((state) => state.currentBranch);
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
  const commitLog = useGitLog({
    repoPath: repoPath ?? null,
    branchKey: currentBranch ?? null,
  });

  React.useEffect(() => {
    setCurrentRepoPath(repoPath || null);
    resetCompareMode();
    if (repoPath) {
      void refreshRepositoryState({ fetchRemote: true });
    }
  }, [changesScopeKey, refreshRepositoryState, repoPath, resetCompareMode, setCurrentRepoPath]);

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
        void refreshRepositoryState({ fetchRemote: true });
        return;
      }

      void compareWorktreeChanges();
    },
    [changesScopeKey, compareWorktreeChanges, refreshRepositoryState, resetCompareMode],
  );

  const handleSelectCommitScope = React.useCallback(
    (commitHash: string) => {
      setChangesScopeState({
        key: changesScopeKey,
        scope: "commit",
        selectedCommitHash: commitHash,
        menuOpen: false,
      });
      void compareAgainstRef(commitHash);
    },
    [changesScopeKey, compareAgainstRef],
  );

  const handleChangesRefresh = React.useCallback(async () => {
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

  const displayedComparedFiles = compareFiles;
  const displayedStagedFiles = stagedFiles;
  const displayedUnstagedFiles = unstagedFiles;
  const displayedUntrackedFiles = untrackedFiles;
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
      <div className="flex h-9 shrink-0 border-b border-sidebar-border bg-background/50 backdrop-blur-sm">
        <Tabs value="changes" className="h-full min-w-0 flex-1">
          <TabsList variant="underline" className="h-full w-full gap-0 py-0!">
            <ChangesToolbar
              value="changes"
              activeValue="changes"
              isRefreshing={isLoading}
              onRefresh={handleChangesRefresh}
              scope={changesScope}
              selectedCommitHash={selectedCommitHash}
              commits={commitLog.commits}
              loadingCommits={commitLog.loading}
              stagedCount={displayedStagedFiles.length}
              unstagedCount={displayedUnstagedFiles.length + displayedUntrackedFiles.length}
              open={changesScopeMenuOpen}
              viewMode={viewMode}
              onOpenChange={setChangesScopeMenuOpen}
              onSelectScope={handleSelectChangesScope}
              onSelectCommit={handleSelectCommitScope}
              onToggleViewMode={() => setViewMode(viewMode === "tree" ? "list" : "tree")}
              className="h-full! flex-1 rounded-none border-0! text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </TabsList>
        </Tabs>
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
            readOnly
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
