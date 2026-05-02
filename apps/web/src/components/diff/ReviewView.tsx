"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  getFileIconProps,
  Loader2,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui";
import { MessageSquarePlus, ChevronRight, LoaderCircle, List, ListTree } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReviewCtx } from "@/components/diff/review/ReviewContextProvider";
import { useReviewSnapshotStore } from "@/hooks/use-review-snapshot-store";
import { useContextParams } from "@/hooks/use-context-params";
import { useEditorStore, EDITOR_REVIEW_DIFF_PREFIX, getEditorSourcePath } from "@/hooks/use-editor-store";
import { CommentCard } from "@/components/diff/review/CommentCard";
import { FrozenFileList } from "@/components/diff/review/FrozenFileList";
import {
  compareReviewTimestamps,
  formatReviewDateTime,
  isOpenReviewCommentStatus,
  sortComments,
} from "@/components/diff/review/utils";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";

const REVIEW_FILE_VIEW_MODE_STORAGE_KEY = "atmos:right-sidebar:review-file-view-mode";

const ReviewView: React.FC = () => {
  const { workspaceId } = useContextParams();
  const getActiveFilePath = useEditorStore((s) => s.getActiveFilePath);
  const rawFilePath = (workspaceId && getActiveFilePath(workspaceId)) || "";
  const filePath = rawFilePath.startsWith(EDITOR_REVIEW_DIFF_PREFIX)
    ? getEditorSourcePath(rawFilePath)
    : "";

  const {
    currentSession,
    currentRevision,
    canEdit,
    comments,
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

  const setSnapshot = useReviewSnapshotStore((s) => s.setSnapshot);
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
  const [fileViewMode, setFileViewMode] = useState<"list" | "tree">(() => {
    if (typeof window === "undefined") return "list";
    const stored = window.localStorage.getItem(REVIEW_FILE_VIEW_MODE_STORAGE_KEY);
    return stored === "tree" ? "tree" : "list";
  });
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [commentGroupsOpen, setCommentGroupsOpen] = useState<Record<string, boolean>>({});
  const [summaryOpen, setSummaryOpen] = useState(true);

  const summaryRunGuid = latestSummaryRun?.guid ?? null;
  const hasLoadedSummary = artifactPreview?.kind === "summary" && artifactPreview?.runGuid === summaryRunGuid;

  useEffect(() => {
    window.localStorage.setItem(REVIEW_FILE_VIEW_MODE_STORAGE_KEY, fileViewMode);
  }, [fileViewMode]);

  useEffect(() => {
    if (summaryRunGuid && !hasLoadedSummary && !artifactLoading) {
      handlePreviewArtifact(summaryRunGuid, "summary");
    }
  }, [summaryRunGuid, hasLoadedSummary, artifactLoading, handlePreviewArtifact]);

  if (!workspaceId) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        No workspace selected.
      </div>
    );
  }

  if (!currentSession) {
    return (
      <div className="p-3">
        <div className="rounded-lg border border-dashed border-sidebar-border bg-background/70 p-4 text-center">
          <p className="text-sm text-foreground">No review session yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start a session to track comments and fix runs for this workspace.
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
            New Review Session
          </Button>
        </div>
      </div>
    );
  }

  const fileCount = currentRevision?.files.length ?? 0;
  const hasFiles = fileCount > 0;
  const hasComments = commentsByFile.length > 0;
  const openCommentCount = comments.filter((t) => isOpenReviewCommentStatus(t.status)).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Inline stats line */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground shrink-0 border-b border-sidebar-border/50">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span>{openCommentCount} open</span>
          <span>·</span>
          <span>
            {currentRevision?.files.filter((f) => f.state.reviewed).length ?? 0}/{fileCount} reviewed
          </span>
          {(currentRevision?.files.filter((f) => f.changed_after_review).length ?? 0) > 0 && (
            <>
              <span>·</span>
              <span className="truncate text-amber-600">
                {currentRevision?.files.filter((f) => f.changed_after_review).length} changed after review
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          title={fileViewMode === "tree" ? "Show as list" : "Show as tree"}
          aria-label={fileViewMode === "tree" ? "Show review files as list" : "Show review files as tree"}
          onClick={() =>
            setFileViewMode((mode) => (mode === "tree" ? "list" : "tree"))
          }
          className="cursor-pointer rounded-sm p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          {fileViewMode === "tree" ? (
            <List className="size-3.5" />
          ) : (
            <ListTree className="size-3.5" />
          )}
        </button>
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
            <span>Changed Files</span>
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
                  onSelectFile={(snapshotGuid, snapFilePath, label) => {
                    setSnapshot({
                      snapshotGuid,
                      label,
                      filePath: snapFilePath,
                    });
                    void openFile(`${EDITOR_REVIEW_DIFF_PREFIX}${snapshotGuid}/${snapFilePath}`, workspaceId, { preview: true });
                  }}
                  onDoubleClickFile={(snapshotGuid, snapFilePath) => {
                    const tabPath = `${EDITOR_REVIEW_DIFF_PREFIX}${snapshotGuid}/${snapFilePath}`;
                    setSnapshot({
                      snapshotGuid,
                      label: revisionLabel,
                      filePath: snapFilePath,
                    });
                    void openFile(tabPath, workspaceId, { preview: false });
                    pinFile(tabPath, workspaceId || undefined);
                  }}
                  onToggleReviewed={handleToggleReviewed}
                  revisionLabel={revisionLabel}
                  viewMode={fileViewMode}
                />
              ) : (
                <p className="px-1 text-xs text-muted-foreground py-2">
                  No changed files in this revision.
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
            <span>Comments</span>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {comments.length}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-2 space-y-3">
              {!hasComments ? (
                <p className="px-1 text-xs text-muted-foreground">
                  No review comments in this revision yet.
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
                      {(() => {
                        const fileName = file.split("/").pop() || file;
                        const iconProps = getFileIconProps({
                          name: fileName,
                          isDir: false,
                          className:
                            "absolute inset-0 size-4 shrink-0 transition-all duration-200 group-hover/comment-file:scale-50 group-hover/comment-file:rotate-[-20deg] group-hover/comment-file:opacity-0",
                        });
                        return (
                          <>
                            <span className="relative size-4 shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img {...iconProps} alt={`File: ${fileName}`} />
                              <ChevronRight
                                className={cn(
                                  "absolute inset-0 size-4 scale-50 rotate-60 text-muted-foreground opacity-0 transition-all duration-200 group-hover/comment-file:scale-100 group-hover/comment-file:opacity-100",
                                  (commentGroupsOpen[file] ?? true)
                                    ? "group-hover/comment-file:rotate-90"
                                    : "group-hover/comment-file:rotate-0",
                                )}
                              />
                            </span>
                            <span className="truncate text-[13px] font-semibold text-foreground">
                              {file}
                            </span>
                          </>
                        );
                      })()}
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
                            const tabPath = `${EDITOR_REVIEW_DIFF_PREFIX}${targetComment.file_snapshot_guid}/${snapFilePath}`;
                            setSnapshot({
                              snapshotGuid: targetComment.file_snapshot_guid,
                              label: revisionLabel,
                              filePath: snapFilePath,
                            });
                            void openFile(tabPath, workspaceId, {
                              preview: true,
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
              <span>Summary</span>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {formatReviewDateTime(latestSummaryRun.updated_at)}
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
                    <span>Loading summary...</span>
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
