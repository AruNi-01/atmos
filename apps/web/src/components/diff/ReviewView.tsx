"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Loader2,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui";
import { MessageSquarePlus, ChevronRight, FileText, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReviewCtx } from "@/components/diff/review/ReviewContextProvider";
import { useReviewSnapshotStore } from "@/hooks/use-review-snapshot-store";
import { useContextParams } from "@/hooks/use-context-params";
import { useEditorStore, EDITOR_REVIEW_DIFF_PREFIX, getEditorSourcePath } from "@/hooks/use-editor-store";
import { ThreadCard } from "@/components/diff/review/ThreadCard";
import { FrozenFileList } from "@/components/diff/review/FrozenFileList";
import { sortThreads, formatDate } from "@/components/diff/review/utils";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";

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
    threads,
    isCreating,
    handleCreateSession,
    handleToggleReviewed,
    handleUpdateThreadStatus,
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
      a.created_at.localeCompare(b.created_at),
    );
    const idx = sorted.findIndex((r) => r.guid === currentRevision.guid);
    return idx >= 0 ? `v${idx + 1}` : "";
  }, [currentRevision, currentSession]);

  const threadsByFile = useMemo(() => {
    const ordered = sortThreads(threads, null);
    const groups = new Map<string, typeof ordered>();
    for (const thread of ordered) {
      const key = thread.anchor.file_path || "(unknown)";
      const list = groups.get(key) ?? [];
      list.push(thread);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [threads]);

  const [filesOpen, setFilesOpen] = useState(true);
  const [threadsOpen, setThreadsOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(true);

  const summaryRunGuid = latestSummaryRun?.guid ?? null;
  const hasLoadedSummary = artifactPreview?.kind === "summary" && artifactPreview?.runGuid === summaryRunGuid;

  useEffect(() => {
    if (summaryRunGuid && !hasLoadedSummary && !artifactLoading) {
      handlePreviewArtifact(summaryRunGuid, "summary");
    }
  }, [summaryRunGuid, hasLoadedSummary, artifactLoading]);

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
  const hasThreads = threadsByFile.length > 0;
  const openThreadCount = threads.filter((t) => t.status === "open" || t.status === "agent_fixed").length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Inline stats line */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground shrink-0 border-b border-sidebar-border/50">
        <span>{openThreadCount} open</span>
        <span>·</span>
        <span>
          {currentRevision?.files.filter((f) => f.state.reviewed).length ?? 0}/{fileCount} reviewed
        </span>
        {(currentRevision?.files.filter((f) => f.changed_after_review).length ?? 0) > 0 && (
          <>
            <span>·</span>
            <span className="text-amber-600">
              {currentRevision?.files.filter((f) => f.changed_after_review).length} changed after review
            </span>
          </>
        )}
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
                />
              ) : (
                <p className="px-1 text-xs text-muted-foreground py-2">
                  No changed files in this revision.
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Review Threads */}
        <Collapsible open={threadsOpen} onOpenChange={setThreadsOpen} className="w-full">
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-200",
                threadsOpen && "rotate-90",
              )}
            />
            <span>Review Threads</span>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {threads.length}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-2 space-y-3">
              {!hasThreads ? (
                <p className="px-1 text-xs text-muted-foreground">
                  No review threads in this revision yet.
                </p>
              ) : (
                threadsByFile.map(([file, group]) => (
                  <div key={file} className="space-y-2">
                    <p className="px-1 text-[11px] font-medium text-muted-foreground truncate">
                      {file}
                    </p>
                    {group.map((thread) => (
                      <ThreadCard
                        key={thread.guid}
                        thread={thread}
                        filePath={filePath}
                        canEdit={
                          canEdit &&
                          thread.revision_guid ===
                            currentSession.current_revision_guid
                        }
                        onUpdateStatus={handleUpdateThreadStatus}
                      />
                    ))}
                  </div>
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
              <FileText className="size-3.5 shrink-0" />
              <span>Summary</span>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {formatDate(latestSummaryRun.updated_at)}
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
