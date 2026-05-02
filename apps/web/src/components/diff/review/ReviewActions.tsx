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
import { Check, ChevronRight, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReviewCtx } from "@/components/diff/review/ReviewContextProvider";
import { FixActionsMenu } from "@/components/diff/review/FixActionsMenu";
import {
  compareReviewTimestamps,
  sortReviewSessions,
} from "@/components/diff/review/utils";
import { reviewWsApi, type ReviewSessionDto } from "@/api/ws-api";

type SessionGroup = {
  status: "active" | "closed" | "archived";
  label: string;
  sessions: ReviewSessionDto[];
};

export const ReviewActions: React.FC = () => {
  const {
    sessions,
    currentSession,
    currentRevision,
    canEdit,
    openRevisionComments,
    activeFixRun,
    isCreating,
    isCreatingFixRun,
    terminalAgentId,
    setTerminalAgentId,
    handleCreateSession,
    handleCopyFixPrompt,
    handleRunFixInTerminal,
    handleMarkFixRunFailed,
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

  const fixDisabled = !canEdit || openRevisionComments.length === 0 || !!activeFixRun;
  const [archivedOpen, setArchivedOpen] = useState(false);

  const sessionGroups = useMemo<SessionGroup[]>(() => {
    const sortedSessions = sortReviewSessions(sessions);
    const groups: SessionGroup[] = [
      {
        status: "active",
        label: "Active",
        sessions: sortedSessions.filter((session) => session.status === "active"),
      },
      {
        status: "closed",
        label: "Closed",
        sessions: sortedSessions.filter((session) => session.status === "closed"),
      },
      {
        status: "archived",
        label: "Archived",
        sessions: sortedSessions.filter((session) => session.status === "archived"),
      },
    ];
    return groups.filter((group) => group.sessions.length > 0);
  }, [sessions]);

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

  const handleActivateSessionByGuid = useCallback(
    async (sessionGuid: string) => {
      try {
        await reviewWsApi.activateSession(sessionGuid);
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to activate session",
          description: error instanceof Error ? error.message : "Unknown error",
          type: "error",
        });
      }
    },
    [loadSessions],
  );

  const renderSessionMenuItem = useCallback(
    (s: ReviewSessionDto) => {
      const sortedRevisions = getSortedRevisions(s);
      const activeSession = s.guid === currentSession?.guid;

      return (
        <DropdownMenuSub key={s.guid}>
          <DropdownMenuSubTrigger
            onClick={() => selectRevision(s.guid, s.current_revision_guid)}
            className={cn(
              "flex max-w-full items-center gap-2 text-xs cursor-pointer",
              activeSession && "[&>svg:last-child]:hidden",
            )}
          >
            <span className="flex-1 truncate">
              {s.title?.trim() || "Review Session"}
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
            <DropdownMenuSeparator />
            {s.status !== "active" && (
              <DropdownMenuItem
                onClick={() => void handleActivateSessionByGuid(s.guid)}
                className="text-xs"
              >
                Activate Session
              </DropdownMenuItem>
            )}
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
              disabled={s.status === "archived"}
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
    },
    [
      currentRevision?.guid,
      currentSession?.guid,
      getSortedRevisions,
      handleActivateSessionByGuid,
      handleArchiveSessionByGuid,
      handleCloseSessionByGuid,
      handleOpenRename,
      handleSubmitRename,
      renameSessionGuid,
      renameValue,
      selectRevision,
    ],
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
            <DropdownMenuContent
              align="start"
              className="w-max min-w-[12rem] max-w-[min(24rem,calc(100vw-2rem))]"
            >
              <DropdownMenuItem
                onClick={handleCreateSession}
                className="text-xs"
                disabled={isCreating}
              >
                New Session
              </DropdownMenuItem>
              {sessionGroups.map((group, groupIndex) => {
                const isArchived = group.status === "archived";
                const isOpen = !isArchived || archivedOpen;

                return (
                  <React.Fragment key={group.status}>
                    {(groupIndex > 0 || sessions.length > 0) && (
                      <DropdownMenuSeparator />
                    )}
                    <div
                      className={cn(
                        "py-1 text-[11px] font-medium text-muted-foreground",
                        isArchived ? "pl-1 pr-2" : "px-2",
                      )}
                    >
                      {isArchived ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setArchivedOpen((open) => !open);
                          }}
                          className="flex w-full items-center gap-1 text-left hover:text-foreground transition-colors cursor-pointer"
                        >
                          <ChevronRight
                            className={cn(
                              "size-3 shrink-0 transition-transform",
                              archivedOpen && "rotate-90",
                            )}
                          />
                          <span>
                            {group.label} {group.sessions.length}
                          </span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span>
                            {group.label} {group.sessions.length}
                          </span>
                        </div>
                      )}
                    </div>
                    {isOpen && group.sessions.map(renderSessionMenuItem)}
                  </React.Fragment>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="w-px self-stretch bg-sidebar-border shrink-0" />

        <FixActionsMenu
          disabled={fixDisabled}
          isLoading={isCreatingFixRun}
          activeRun={activeFixRun}
          agentId={terminalAgentId}
          onAgentChange={setTerminalAgentId}
          onFix={(agentId) => handleRunFixInTerminal(undefined, agentId)}
          onCopyPrompt={() => handleCopyFixPrompt()}
          onMarkFailed={(run) => handleMarkFixRunFailed(run)}
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
