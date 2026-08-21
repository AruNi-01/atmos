"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  Loader2,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui";
import { MessageSquarePlus, ChevronRight, LoaderCircle, List, ListTree } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useReviewCtx } from "@/features/diff/components/review/ReviewContextProvider";
import { useReviewSnapshotStore } from "@/features/code-review/store/review-snapshot-store";
import { useContextParams } from "@/shared/hooks/use-context-params";
import {
  useEditorStore,
  EDITOR_REVIEW_DIFF_PREFIX,
  EDITOR_REVIEW_GROUP_PREFIX,
  isReviewGroupEditorPath,
  getEditorSourcePath,
} from "@/features/editor/store/use-editor-store";
import { DiffFilePathLabel } from "@/features/diff/components/DiffFilePathLabel";
import { CommentCard } from "@/features/diff/components/review/CommentCard";
import { FrozenFileList } from "@/features/diff/components/review/FrozenFileList";
import {
  compareReviewTimestamps,
  formatReviewDateTime,
  getScopeBadgeText,
  isOpenReviewCommentStatus,
  sortComments,
} from "@/features/diff/components/review/utils";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";

import { useSidebarUiPrefs } from "@/shared/stores/use-ui-pref-hooks";

export type ReviewViewOpenFileArgs = {
  groupPath: string;
  snapshotGuid?: string;
  filePath: string;
  preview: boolean;
  line?: number;
  reviewCommentGuid?: string;
  reviewMessageGuid?: string;
};

interface ReviewViewProps {
  contextId?: string | null;
  currentFilePath?: string | null;
  onOpenReviewFile?: (args: ReviewViewOpenFileArgs) => void;
}

const ReviewView: React.FC<ReviewViewProps> = ({
  contextId,
  currentFilePath,
  onOpenReviewFile,
}) => {
  const t = useTranslations("diff.reviewView");
  const locale = useLocale();
  const { effectiveContextId } = useContextParams();
  const reviewEditorKey = contextId ?? effectiveContextId;
  const getActiveFilePath = useEditorStore((s) => s.getActiveFilePath);
  const rawFilePath = (reviewEditorKey && getActiveFilePath(reviewEditorKey)) || "";
  const activeGroupedFilePath = useEditorStore((s) =>
    reviewEditorKey ? s.diffGroupActiveFiles[reviewEditorKey]?.[rawFilePath] ?? "" : "",
  );
  const editorFilePath = isReviewGroupEditorPath(rawFilePath)
    ? activeGroupedFilePath
    : rawFilePath.startsWith(EDITOR_REVIEW_DIFF_PREFIX)
      ? getEditorSourcePath(rawFilePath)
      : "";
  const filePath = currentFilePath ?? editorFilePath;

  const {
    currentSession,
    currentRevision,
    canEdit,
    comments,
    isLoading,
    isCreating,
    handleCreateSession,
    handleToggleReviewed,
    handleUpdateCommentStatus,
    handleReplyToComment,
    handleUpdateMessage,
    handleDeleteMessage,
    latestSummaryRun,
    handlePreviewArtifact,
    artifactPreview,
    artifactLoading,
  } = useReviewCtx();

  const setSessionDisplay = useReviewSnapshotStore((s) => s.setSessionDisplay);
  const openFile = useEditorStore((s) => s.openFile);
  const pinFile = useEditorStore((s) => s.pinFile);

  const revisionLabel = useMemo(() => {
    if (!currentSession || !currentRevision) return "";
    const sorted = [...currentSession.revisions].sort((a, b) =>
      compareReviewTimestamps(a.created_at, b.created_at),
    );
    const idx = sorted.findIndex((r) => r.guid === currentRevision.guid);
    return idx >= 0 ? `v${idx + 1}` : "";
  }, [currentRevision, currentSession]);

  useEffect(() => {
    setSessionDisplay({
      sessionTitle: currentSession?.title?.trim() || null,
      revisionLabel: revisionLabel || null,
    });
  }, [currentSession, revisionLabel, setSessionDisplay]);

  const commentsByFile = useMemo(() => {
    const ordered = sortComments(comments, null);
    const groups = new Map<string, typeof ordered>();
    for (const comment of ordered) {
      const key = comment.anchor.file_path || "(unknown)";
      const list = groups.get(key) ?? [];
      list.push(comment);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [comments]);

  const [filesOpen, setFilesOpen] = useState(true);
  const [sidebarUi, setSidebarUi] = useSidebarUiPrefs();
  const fileViewMode = sidebarUi.reviewFileViewMode;
  const setFileViewMode = (mode: "list" | "tree") =>
    setSidebarUi({ reviewFileViewMode: mode });
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [commentGroupsOpen, setCommentGroupsOpen] = useState<Record<string, boolean>>({});
  const [summaryOpen, setSummaryOpen] = useState(true);

  const summaryRunGuid = latestSummaryRun?.guid ?? null;
  const hasLoadedSummary = artifactPreview?.kind === "summary" && artifactPreview?.runGuid === summaryRunGuid;
  const reviewGroupPath = currentRevision
    ? `${EDITOR_REVIEW_GROUP_PREFIX}${currentRevision.guid}`
    : null;

  const openReviewFile = React.useCallback(
    ({
      snapshotGuid,
      snapFilePath,
      preview,
      line,
      reviewCommentGuid,
      reviewMessageGuid,
    }: {
      snapshotGuid?: string;
      snapFilePath: string;
      preview: boolean;
      line?: number;
      reviewCommentGuid?: string;
      reviewMessageGuid?: string;
    }) => {
      if (!reviewGroupPath) return;
      if (onOpenReviewFile) {
        onOpenReviewFile({
          groupPath: reviewGroupPath,
          snapshotGuid,
          filePath: snapFilePath,
          preview,
          line,
          reviewCommentGuid,
          reviewMessageGuid,
        });
        return;
      }
      void openFile(reviewGroupPath, reviewEditorKey ?? undefined, {
        preview,
        diffFilePath: snapFilePath,
        line,
        reviewCommentGuid,
        reviewMessageGuid,
      });
      if (!preview) {
        pinFile(reviewGroupPath, reviewEditorKey ?? undefined);
      }
    },
    [onOpenReviewFile, openFile, pinFile, reviewEditorKey, reviewGroupPath],
  );

  useEffect(() => {
    if (summaryRunGuid && !hasLoadedSummary && !artifactLoading) {
      handlePreviewArtifact(summaryRunGuid, "summary");
    }
  }, [summaryRunGuid, hasLoadedSummary, artifactLoading, handlePreviewArtifact]);

  if (!reviewEditorKey) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        {t("empty.noContext")}
      </div>
    );
  }

  if (isLoading && !currentSession) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Loader2 className="size-6 animate-spin text-muted-foreground/85" />
      </div>
    );
  }

  if (!currentSession) {
    return (
      <div className="p-3">
        <div className="rounded-lg border border-dashed border-sidebar-border bg-background/70 p-4 text-center">
          <p className="text-sm text-foreground">{t("empty.noSessionTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("empty.noSessionDescription")}
          </p>
          <Button
            size="sm"
            className="mt-3"
            onClick={handleCreateSession}
            disabled={isCreating}
          >
            {isCreating ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
                <MessageSquarePlus className="mr-2 size-4" />
              )}
            {t("empty.newSession")}
          </Button>
        </div>
      </div>
    );
  }

  const fileCount = currentRevision?.files.length ?? 0;
  const hasFiles = fileCount > 0;
  const hasComments = commentsByFile.length > 0;
  const openCommentCount = comments.filter((t) => isOpenReviewCommentStatus(t.status)).length;
  const reviewedCount = currentRevision?.files.filter((f) => f.state.reviewed).length ?? 0;
  const changedAfterReviewCount =
    currentRevision?.files.filter((f) => f.changed_after_review).length ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Inline stats line */}
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* N2: scope badge */}
          <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
            {getScopeBadgeText(currentSession)}
          </span>
          <span>{t("stats.openCount", { count: openCommentCount })}</span>
          <span>·</span>
          <span>
            {t("stats.reviewedCount", {
              reviewed: reviewedCount,
              total: fileCount,
            })}
          </span>
          {changedAfterReviewCount > 0 && (
            <>
              <span>·</span>
              <span className="truncate text-amber-600">
                {t("stats.changedAfterReview", { count: changedAfterReviewCount })}
              </span>
            </>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title={fileViewMode === "tree" ? t("viewMode.showAsList") : t("viewMode.showAsTree")}
          aria-label={fileViewMode === "tree" ? t("viewMode.ariaList") : t("viewMode.ariaTree")}
          onClick={() =>
            setFileViewMode(fileViewMode === "tree" ? "list" : "tree")
          }
          className="text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-foreground"
        >
          {fileViewMode === "tree" ? (
            <List className="size-3.5" />
          ) : (
            <ListTree className="size-3.5" />
          )}
        </Button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-1">
        {/* Frozen Files */}
        <Collapsible open={filesOpen} onOpenChange={setFilesOpen} className="w-full">
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-200",
                filesOpen && "rotate-90",
              )}
            />
            <span>{t("sections.changedFiles")}</span>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {currentSession.reviewed_file_count}/{fileCount}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-2">
              {hasFiles ? (
                <FrozenFileList
                  revision={currentRevision}
                  currentFilePath={filePath}
                  canEdit={canEdit}
                  onSelectFile={(snapshotGuid, snapFilePath) =>
                    openReviewFile({
                      snapshotGuid,
                      snapFilePath,
                      preview: true,
                    })
                  }
                  onDoubleClickFile={(snapshotGuid, snapFilePath) =>
                    openReviewFile({
                      snapshotGuid,
                      snapFilePath,
                      preview: false,
                    })
                  }
                  onToggleReviewed={handleToggleReviewed}
                  revisionLabel={revisionLabel}
                  viewMode={fileViewMode}
                />
              ) : (
                <p className="px-1 text-xs text-muted-foreground py-2">
                  {t("sections.noChangedFiles")}
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Comments */}
        <Collapsible open={commentsOpen} onOpenChange={setCommentsOpen} className="w-full">
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-200",
                commentsOpen && "rotate-90",
              )}
            />
            <span>{t("sections.comments")}</span>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {comments.length}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-2 space-y-3">
              {!hasComments ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {t("sections.noComments")}
                </p>
              ) : (
                commentsByFile.map(([file, group]) => (
                  <Collapsible
                    key={file}
                    open={commentGroupsOpen[file] ?? true}
                    onOpenChange={(open) =>
                      setCommentGroupsOpen((prev) => ({ ...prev, [file]: open }))
                    }
                    className="space-y-2"
                  >
                    <CollapsibleTrigger className="group/comment-file flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-sidebar-accent/40 cursor-pointer">
                      <DiffFilePathLabel
                        path={file}
                        className="flex min-w-0 flex-1 items-center gap-2"
                        fileNameClassName="text-[13px] text-foreground font-semibold whitespace-nowrap shrink-0"
                        dirPathClassName="text-[11px] text-muted-foreground/40 whitespace-nowrap truncate min-w-0 flex-1 text-left"
                      />
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {group.length}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2">
                      {group.map((comment) => (
                        <CommentCard
                          key={comment.guid}
                          comment={comment}
                          canEdit={
                            canEdit &&
                            comment.revision_guid ===
                              currentSession.current_revision_guid
                          }
                          onUpdateStatus={handleUpdateCommentStatus}
                          onReply={handleReplyToComment}
                          onUpdateMessage={handleUpdateMessage}
                          onDeleteMessage={handleDeleteMessage}
                          onNavigate={(targetComment, targetMessage) => {
                            const snapFilePath =
                              targetComment.anchor.file_path || file;
                            openReviewFile({
                              preview: true,
                              snapFilePath,
                              line: targetComment.anchor_start_line,
                              reviewCommentGuid: targetComment.guid,
                              reviewMessageGuid: targetMessage?.guid,
                            });
                          }}
                        />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Fix Run Summary */}
        {latestSummaryRun && (
          <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen} className="w-full">
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 transition-transform duration-200",
                  summaryOpen && "rotate-90",
                )}
              />
              <span>{t("sections.summary")}</span>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {formatReviewDateTime(latestSummaryRun.updated_at, locale)}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pb-2 px-1">
                {artifactPreview?.runGuid === latestSummaryRun.guid && artifactPreview?.kind === "summary" ? (
                  <div className="rounded-md border border-border bg-background/80 p-3">
                    <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
                      {artifactPreview.content}
                    </MarkdownRenderer>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <LoaderCircle className="size-3 animate-spin" />
                    <span>{t("sections.loadingSummary")}</span>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
};

export default ReviewView;
