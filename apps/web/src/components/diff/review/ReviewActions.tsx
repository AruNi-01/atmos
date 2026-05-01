"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  toastManager,
} from "@workspace/ui";
import { Check, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReviewCtx } from "@/components/diff/review/ReviewContextProvider";
import { FixActionsMenu } from "@/components/diff/review/FixActionsMenu";
import {
  compareReviewTimestamps,
  sessionStatusTone,
} from "@/components/diff/review/utils";
import { reviewWsApi, type ReviewSessionDto } from "@/api/ws-api";

export const ReviewActions: React.FC = () => {
  const {
    sessions,
    currentSession,
    currentRevision,
    canEdit,
    openRevisionComments,
    isCreating,
    isCreatingFixRun,
    terminalAgentId,
    setTerminalAgentId,
    handleCreateSession,
    handleCopyFixPrompt,
    handleRunFixInTerminal,
    loadSessions,
    loadComments,
    setSelectedSessionGuid,
    setSelectedRevisionGuid,
    setArtifactPreview,
  } = useReviewCtx();

  const revisionLabel = useMemo(() => {
    if (!currentSession || !currentRevision) return "Live";
    const sorted = [...currentSession.revisions].sort((a, b) =>
      compareReviewTimestamps(a.created_at, b.created_at),
    );
    const idx = sorted.findIndex((r) => r.guid === currentRevision.guid);
    return idx >= 0 ? `v${idx + 1}` : "Revision";
  }, [currentRevision, currentSession]);

  const getSortedRevisions = useCallback(
    (session: ReviewSessionDto) =>
      [...session.revisions].sort((a, b) =>
        compareReviewTimestamps(a.created_at, b.created_at),
      ),
    [],
  );

  const selectRevision = useCallback(
    (sessionGuid: string, revisionGuid: string | null) => {
      setSelectedSessionGuid(sessionGuid);
      setSelectedRevisionGuid(revisionGuid);
      setArtifactPreview(null);
    },
    [setArtifactPreview, setSelectedRevisionGuid, setSelectedSessionGuid],
  );

  const fixDisabled = !canEdit || openRevisionComments.length === 0;

  const isRefreshingRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await Promise.all([loadSessions(), loadComments()]);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
        isRefreshingRef.current = false;
      }, 300);
    }
  }, [loadSessions, loadComments]);

  const [renameSessionGuid, setRenameSessionGuid] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const handleOpenRename = useCallback((session: ReviewSessionDto) => {
    setRenameValue(session.title ?? "");
    setRenameSessionGuid(session.guid);
  }, []);
  const handleSubmitRename = useCallback(async () => {
    const title = renameValue.trim();
    if (!renameSessionGuid || !title) return;
    try {
      await reviewWsApi.renameSession(renameSessionGuid, title);
      await loadSessions();
      toastManager.add({
        title: "Session renamed",
        description: `Session renamed to "${title}"`,
        type: "success",
      });
      setRenameSessionGuid(null);
    } catch (error) {
      toastManager.add({
        title: "Failed to rename session",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  }, [loadSessions, renameSessionGuid, renameValue]);

  const handleCloseSessionByGuid = useCallback(
    async (sessionGuid: string) => {
      try {
        await reviewWsApi.closeSession(sessionGuid);
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to close session",
          description: error instanceof Error ? error.message : "Unknown error",
          type: "error",
        });
      }
    },
    [loadSessions],
  );

  const handleArchiveSessionByGuid = useCallback(
    async (sessionGuid: string) => {
      try {
        await reviewWsApi.archiveSession(sessionGuid);
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to archive session",
          description: error instanceof Error ? error.message : "Unknown error",
          type: "error",
        });
      }
    },
    [loadSessions],
  );

  return (
    <div className="flex-1 flex items-stretch min-w-0">
      <div className="flex items-stretch flex-1 min-w-0">
        <div className="flex items-stretch shrink min-w-0 max-w-[60%]">
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) setRenameSessionGuid(null);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-2.5 h-full text-[13px] text-foreground hover:bg-sidebar-accent/30 transition-colors cursor-pointer min-w-0 max-w-full"
                title={currentSession?.title?.trim() || "Session"}
              >
                <span className="font-medium shrink-0">{revisionLabel}</span>
                <span className="text-muted-foreground truncate min-w-0">
                  {currentSession?.title?.trim() || "Session"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[15rem]">
              <DropdownMenuItem
                onClick={handleCreateSession}
                className="text-xs"
                disabled={isCreating}
              >
                New Session
              </DropdownMenuItem>
              {sessions.length > 0 && <DropdownMenuSeparator className="mx-2" />}
              {sessions.map((s) => {
                const sortedRevisions = getSortedRevisions(s);
                const activeSession = s.guid === currentSession?.guid;

                return (
                  <DropdownMenuSub key={s.guid}>
                    <DropdownMenuSubTrigger
                      onClick={() =>
                        selectRevision(s.guid, s.current_revision_guid)
                      }
                      className={cn(
                        "flex items-center gap-2 text-xs cursor-pointer",
                        activeSession && "[&>svg:last-child]:hidden",
                      )}
                    >
                      <span className="flex-1 truncate">
                        {s.title?.trim() || "Review Session"}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-px text-[10px] font-medium capitalize shrink-0",
                          sessionStatusTone(s.status),
                        )}
                      >
                        {s.status.replaceAll("_", " ")}
                      </span>
                      {activeSession && (
                        <Check className="size-3.5 shrink-0 text-foreground" />
                      )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-[10rem]">
                      {sortedRevisions.map((rev, idx) => {
                        const activeRevision =
                          activeSession && rev.guid === currentRevision?.guid;
                        const label = `v${idx + 1}`;

                        return (
                          <DropdownMenuItem
                            key={rev.guid}
                            onClick={() => selectRevision(s.guid, rev.guid)}
                            className="flex items-center gap-2 text-xs cursor-pointer"
                          >
                            <span className="font-medium shrink-0">
                              {label}
                            </span>
                            <span className="flex-1 truncate text-muted-foreground">
                              {rev.title?.trim() || "Revision"}
                            </span>
                            <Check
                              className={cn(
                                "size-3.5 shrink-0",
                                activeRevision
                                  ? "text-foreground"
                                  : "invisible",
                              )}
                            />
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuSeparator className="mx-2" />
                      <DropdownMenuItem
                        onClick={() => void handleCloseSessionByGuid(s.guid)}
                        className="text-xs"
                        disabled={s.status !== "active"}
                      >
                        Close Session
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void handleArchiveSessionByGuid(s.guid)}
                        className="text-xs"
                      >
                        Archive Session
                      </DropdownMenuItem>
                      <DropdownMenuSub
                        open={renameSessionGuid === s.guid}
                        onOpenChange={(open) => {
                          if (open) {
                            handleOpenRename(s);
                          } else if (renameSessionGuid === s.guid) {
                            setRenameSessionGuid(null);
                          }
                        }}
                      >
                        <DropdownMenuSubTrigger
                          className="text-xs cursor-pointer"
                          disabled={s.status !== "active"}
                        >
                          <span className="flex-1">Rename</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          className="w-56 p-3"
                          onKeyDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void handleSubmitRename();
                              }
                            }}
                            className="text-xs"
                          />
                          <div className="flex justify-end gap-1.5 mt-2">
                            <button
                              type="button"
                              onClick={() => setRenameSessionGuid(null)}
                              className="px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSubmitRename()}
                              className="px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="w-px self-stretch bg-sidebar-border shrink-0" />

        <FixActionsMenu
          disabled={fixDisabled}
          isLoading={isCreatingFixRun}
          agentId={terminalAgentId}
          onAgentChange={setTerminalAgentId}
          onFix={(agentId) => handleRunFixInTerminal(undefined, agentId)}
          onCopyPrompt={() => handleCopyFixPrompt()}
        />
      </div>

      <div className="w-px self-stretch bg-sidebar-border shrink-0" />

      <button
        type="button"
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="flex items-center justify-center px-2 h-full text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/30 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        title="Refresh review data"
      >
        <LoaderCircle className={cn("size-3.5", isRefreshing && "animate-spin")} />
      </button>
    </div>
  );
};
