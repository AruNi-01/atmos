"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { File, List, ListTree } from "lucide-react";
import { Check, Tabs, TabsList } from "@workspace/ui";

import { gitApi, type GitChangedFile } from "@/api/ws-api";
import {
  DIFF_GROUP_TAB_LABELS,
  type DiffChangeGroupKind,
} from "@/features/diff/lib/diff-editor-paths";
import { createCanvasCenterTab } from "@/features/canvas/lib/canvas-center-tabs";
import {
  getCanvasContextId,
  type CanvasWidgetShape,
  type CanvasWidgetSourceRef,
} from "@/features/canvas/lib/canvas-widget-shape";
import { useOpenCanvasCenterTab } from "@/features/canvas/hooks/use-open-canvas-center-tab";
import { ChangeSection } from "@/app-shell/sidebar/ChangeSection";
import { RefreshableTabsTab } from "@/shared/components/ui/RefreshableTabsTab";
import { useSidebarUiPrefs } from "@/shared/stores/use-ui-pref-hooks";
import { type TLShapeId } from "tldraw";

type CanvasChangesWidgetSource = Extract<CanvasWidgetSourceRef, { type: "changes" }>;

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
  const [stagedFiles, setStagedFiles] = React.useState<GitChangedFile[]>([]);
  const [unstagedFiles, setUnstagedFiles] = React.useState<GitChangedFile[]>([]);
  const [untrackedFiles, setUntrackedFiles] = React.useState<GitChangedFile[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = React.useState<string | null>(null);
  const [sidebarUi, setSidebarUi] = useSidebarUiPrefs();
  const viewMode = sidebarUi.changesFileViewMode;
  const setViewMode = (mode: "list" | "tree") =>
    setSidebarUi({ changesFileViewMode: mode });
  const openCenterTab = useOpenCanvasCenterTab(shapeId, source.context);

  const loadChanges = React.useCallback(async () => {
    if (!repoPath) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await gitApi.getChangedFiles(repoPath, null, false);
      setStagedFiles(response.staged_files);
      setUnstagedFiles(response.unstaged_files);
      setUntrackedFiles(response.untracked_files);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.loadFailed"));
      setStagedFiles([]);
      setUnstagedFiles([]);
      setUntrackedFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  React.useEffect(() => {
    void loadChanges();
  }, [loadChanges]);

  const runGitMutation = React.useCallback(
    async (files: string[], action: (files: string[]) => Promise<unknown>) => {
      if (!repoPath || files.length === 0) return;
      setIsLoading(true);
      setError(null);
      try {
        await action(files);
        await loadChanges();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.gitActionFailed"));
        setIsLoading(false);
      }
    },
    [loadChanges, repoPath, t],
  );

  const stageFiles = React.useCallback(
    (files: string[]) => runGitMutation(files, (nextFiles) => gitApi.stage(repoPath, nextFiles)),
    [repoPath, runGitMutation],
  );
  const unstageFiles = React.useCallback(
    (files: string[]) => runGitMutation(files, (nextFiles) => gitApi.unstage(repoPath, nextFiles)),
    [repoPath, runGitMutation],
  );
  const discardUnstagedChanges = React.useCallback(
    (files: string[]) => runGitMutation(files, (nextFiles) => gitApi.discardUnstaged(repoPath, nextFiles)),
    [repoPath, runGitMutation],
  );
  const discardUntrackedFiles = React.useCallback(
    (files: string[]) => runGitMutation(files, (nextFiles) => gitApi.discardUntracked(repoPath, nextFiles)),
    [repoPath, runGitMutation],
  );

  const totalCount = stagedFiles.length + unstagedFiles.length + untrackedFiles.length;
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
      kind: "staged" | "unstaged" | "untracked" | "compared";
      groupPath: string;
      filePath: string;
      preview: boolean;
    }) => {
      if (kind === "compared" || !repoPath) return;
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
            <RefreshableTabsTab
              value="changes"
              activeValue="changes"
              refreshTitle={t("refreshTitle")}
              onRefresh={loadChanges}
              isRefreshing={isLoading}
              trailingAction={({ isVisible }) => (
                <span
                  role="button"
                  title={viewMode === "tree" ? t("viewMode.showAsList") : t("viewMode.showAsTree")}
                  aria-label={
                    viewMode === "tree"
                      ? t("viewMode.showChangedFilesAsList")
                      : t("viewMode.showChangedFilesAsTree")
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
                    setViewMode(viewMode === "tree" ? "list" : "tree");
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    setViewMode(viewMode === "tree" ? "list" : "tree");
                  }}
                  className="flex h-full w-8 cursor-pointer items-center justify-center border-l border-sidebar-border/60 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                >
                  {viewMode === "tree" ? (
                    <List className="size-3.5" />
                  ) : (
                    <ListTree className="size-3.5" />
                  )}
                </span>
              )}
              className="h-full! flex-1 rounded-none border-0! text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              <File className="size-3.5" />
              <span>{t("filesTab")}</span>
            </RefreshableTabsTab>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error ? (
          <div className="px-2 py-3 text-xs text-destructive">{error}</div>
        ) : isLoading && totalCount === 0 ? (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            {t("loading")}
          </div>
        ) : totalCount === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground/50">
            <Check className="mb-2 size-8 opacity-20" />
            <span className="text-xs">{t("empty")}</span>
          </div>
        ) : (
          <>
            <ChangeSection
              kind="staged"
              title={t("sections.staged")}
              files={stagedFiles}
              workspaceId={contextId}
              viewMode={viewMode}
              selectedFilePath={selectedPathForSection(stagedFiles)}
              onOpenDiffFile={openDiffFile}
              onUnstage={unstageFiles}
              onUnstageAll={() => unstageFiles(stagedFiles.map((file) => file.path))}
            />
            <ChangeSection
              kind="unstaged"
              title={t("sections.unstaged")}
              files={unstagedFiles}
              workspaceId={contextId}
              viewMode={viewMode}
              selectedFilePath={selectedPathForSection(unstagedFiles)}
              onOpenDiffFile={openDiffFile}
              onStage={stageFiles}
              onDiscard={discardUnstagedChanges}
              onStageAll={() => stageFiles(unstagedFiles.map((file) => file.path))}
              onDiscardAll={() => discardUnstagedChanges(unstagedFiles.map((file) => file.path))}
            />
            <ChangeSection
              kind="untracked"
              title={t("sections.untracked")}
              files={untrackedFiles}
              workspaceId={contextId}
              viewMode={viewMode}
              selectedFilePath={selectedPathForSection(untrackedFiles)}
              onOpenDiffFile={openDiffFile}
              onStage={stageFiles}
              onDiscard={discardUntrackedFiles}
              onStageAll={() => stageFiles(untrackedFiles.map((file) => file.path))}
              onDiscardAll={() => discardUntrackedFiles(untrackedFiles.map((file) => file.path))}
            />
          </>
        )}
      </div>
    </div>
  );
}
