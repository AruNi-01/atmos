"use client";

import React, { useImperativeHandle, useMemo } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Loader2,
} from "@workspace/ui";
import { MoreHorizontal, MessageSquarePlus } from "lucide-react";
import { useReviewContext } from "@/hooks/use-review-context";
import { useReviewSnapshotStore } from "@/hooks/use-review-snapshot-store";
import { useContextParams } from "@/hooks/use-context-params";
import { useEditorStore } from "@/hooks/use-editor-store";
import { ThreadCard } from "@/components/diff/review/ThreadCard";
import { FrozenFileList } from "@/components/diff/review/FrozenFileList";
import { RevisionPicker } from "@/components/diff/review/RevisionPicker";
import { FixActionsMenu } from "@/components/diff/review/FixActionsMenu";
import { sortThreads } from "@/components/diff/review/utils";

export interface ReviewViewHandle {
  refresh: () => Promise<void>;
}

interface ReviewViewProps {
  refreshRef?: React.Ref<ReviewViewHandle>;
  reviewSubTab?: "files" | "threads";
}

const ReviewView: React.FC<ReviewViewProps> = ({ refreshRef, reviewSubTab = "files" }) => {
  const { workspaceId } = useContextParams();
  const getActiveFilePath = useEditorStore((s) => s.getActiveFilePath);
  const filePath = (workspaceId && getActiveFilePath(workspaceId)) || "";

  const ctx = useReviewContext({ workspaceId, filePath });
  const setSnapshot = useReviewSnapshotStore((s) => s.setSnapshot);

  useImperativeHandle(
    refreshRef,
    () => ({
      refresh: async () => {
        await ctx.loadSessions();
        await ctx.loadThreads();
      },
    }),
    [ctx],
  );

  const {
    sessions,
    currentSession,
    currentRevision,
    canEdit,
    openRevisionThreads,
    threads,
    isCreating,
    isCreatingFixRun,
    terminalAgentId,
    setTerminalAgentId,
    handleCreateSession,
    handleCloseSession,
    handleArchiveSession,
    handleToggleReviewed,
    handleUpdateThreadStatus,
    handleCopyFixPrompt,
    handleRunFixInTerminal,
    setSelectedSessionGuid,
    setSelectedRevisionGuid,
    setArtifactPreview,
  } = ctx;

  const revisionLabel = useMemo(() => {
    if (!currentSession || !currentRevision) return "Live";
    const sorted = [...currentSession.revisions].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    const idx = sorted.findIndex((r) => r.guid === currentRevision.guid);
    return idx >= 0 ? `v${idx + 1}` : "Revision";
  }, [currentRevision, currentSession]);

  // Group threads by file using sortThreads order
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

  if (!workspaceId) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        No workspace selected.
      </div>
    );
  }

  // Empty state — no session yet
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

  const showRevisionPicker = currentSession.revisions.length > 1;
  const fixDisabled = !canEdit || openRevisionThreads.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {showRevisionPicker && (
            <RevisionPicker
              revisions={currentSession.revisions}
              selectedGuid={currentRevision?.guid ?? null}
              onSelect={(guid) => {
                setSelectedRevisionGuid(guid);
                setArtifactPreview(null);
              }}
            />
          )}
          {sessions.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-md border border-sidebar-border px-2 py-1 text-xs text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer truncate max-w-[10rem]"
                  title={currentSession.title?.trim() || "Review Session"}
                >
                  {currentSession.title?.trim() || "Session"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[12rem]">
                {sessions.map((s) => (
                  <DropdownMenuItem
                    key={s.guid}
                    onClick={() => {
                      setSelectedSessionGuid(s.guid);
                      setSelectedRevisionGuid(null);
                      setArtifactPreview(null);
                    }}
                    className="text-xs"
                  >
                    {(s.title?.trim() || "Review Session") +
                      ` · ${s.status.replaceAll("_", " ")}`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <FixActionsMenu
            disabled={fixDisabled}
            isLoading={isCreatingFixRun}
            agentId={terminalAgentId}
            onAgentChange={setTerminalAgentId}
            onFix={(agentId) => handleRunFixInTerminal(undefined, agentId)}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                title="More actions"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              <DropdownMenuItem
                onClick={handleCreateSession}
                className="text-xs"
                disabled={isCreating}
              >
                New Session
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleCloseSession}
                className="text-xs"
                disabled={currentSession.status !== "active"}
              >
                Close Session
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleArchiveSession}
                className="text-xs"
              >
                Archive Session
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleCopyFixPrompt()}
                className="text-xs"
                disabled={fixDisabled}
              >
                Copy Revision Prompt
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleRunFixInTerminal()}
                className="text-xs"
                disabled={fixDisabled}
              >
                Run In Terminal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Inline stats line */}
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground shrink-0 border-b border-sidebar-border/50">
        <span>{currentSession.open_thread_count} open</span>
        <span>·</span>
        <span>
          {currentSession.reviewed_file_count}/{currentRevision?.files.length ?? 0} reviewed
        </span>
        {currentSession.reviewed_then_changed_count > 0 && (
          <>
            <span>·</span>
            <span className="text-amber-600">
              {currentSession.reviewed_then_changed_count} changed after review
            </span>
          </>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {reviewSubTab === "files" ? (
          <div className="px-2 py-2">
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
              }}
              onToggleReviewed={handleToggleReviewed}
              revisionLabel={revisionLabel}
            />
          </div>
        ) : (
          <div className="px-2 py-2 space-y-3">
            {threadsByFile.length === 0 ? (
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
        )}
      </div>
    </div>
  );
};

export default ReviewView;
