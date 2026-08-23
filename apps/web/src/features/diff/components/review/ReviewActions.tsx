"use client";

import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import {
  Button,
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
import { Check, ChevronDown, ChevronRight, LoaderCircle, RotateCcw } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useReviewCtx } from "@/features/diff/components/review/ReviewContextProvider";
import { FixActionsMenu } from "@/features/diff/components/review/FixActionsMenu";
import {
  compareReviewTimestamps,
  sortReviewSessions,
} from "@/features/diff/components/review/utils";
import { reviewWsApi, type ReviewSessionDto } from "@/api/ws-api";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";

type SessionGroup = {
  status: "active" | "closed" | "archived";
  label: string;
  sessions: ReviewSessionDto[];
};

export const ReviewActions: React.FC = () => {
  const t = useTranslations("diff.reviewActions");
  const {
    sessions,
    currentSession,
    currentRevision,
    canEdit,
    openRevisionComments,
    activeAgentRun,
    activeReviewRun,
    activeFixRun,
    isCreating,
    isCreatingAgentRun,
    terminalAgentId,
    terminalAgentRunConfigs,
    terminalAgentRunConfig,
    setTerminalAgentId,
    setTerminalAgentRunConfig,
    handleCreateSession,
    handleCopyAgentPrompt,
    handleRunAgentInTerminal,
    handleRunAgentReview,
    handleCopyAgentReviewPrompt,
    handleMarkAgentRunFailed,
    loadSessions,
    loadComments,
    setSelectedSessionGuid,
    setSelectedRevisionGuid,
    setArtifactPreview,
  } = useReviewCtx();

  const setCodeReviewDialogOpen = useDialogStore((state) => state.setCodeReviewDialogOpen);

  const handleOpenAgentReview = useCallback(() => {
    setCodeReviewDialogOpen(true);
  }, [setCodeReviewDialogOpen]);

  const revisionLabel = useMemo(() => {
    if (!currentSession || !currentRevision) return t("revision.live");
    const sorted = [...currentSession.revisions].sort((a, b) =>
      compareReviewTimestamps(a.created_at, b.created_at),
    );
    const idx = sorted.findIndex((r) => r.guid === currentRevision.guid);
    return idx >= 0
      ? t("revision.versionLabel", { number: idx + 1 })
      : t("revision.fallback");
  }, [currentRevision, currentSession, t]);

  const getSortedRevisions = useCallback(
    (session: ReviewSessionDto) =>
      [...session.revisions].sort((a, b) =>
        compareReviewTimestamps(b.created_at, a.created_at),
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

  const fixDisabled = !canEdit || openRevisionComments.length === 0 || !!activeFixRun || !!activeReviewRun;
  const reviewDisabled = !canEdit || !!activeReviewRun || !!activeFixRun;
  const [archivedOpen, setArchivedOpen] = useState(false);

  const sessionGroups = useMemo<SessionGroup[]>(() => {
    const sortedSessions = sortReviewSessions(sessions);
    const groups: SessionGroup[] = [
      {
        status: "active",
        label: t("groups.active"),
        sessions: sortedSessions.filter((session) => session.status === "active"),
      },
      {
        status: "closed",
        label: t("groups.closed"),
        sessions: sortedSessions.filter((session) => session.status === "closed"),
      },
      {
        status: "archived",
        label: t("groups.archived"),
        sessions: sortedSessions.filter((session) => session.status === "archived"),
      },
    ];
    return groups.filter((group) => group.sessions.length > 0);
  }, [sessions, t]);

  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [showRefresh, setShowRefresh] = useState(true);
  const fitStateRef = useRef({ show: true, hideThreshold: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

    const check = () => {
      const width = container.clientWidth;
      const state = fitStateRef.current;

      // We measure overflow on the *inner* wrapper (session + fix). With
      // `min-w-0` all the way down, the outer container's scrollWidth never
      // exceeds its clientWidth, so overflow must be observed where the
      // squeezed content actually lives (the Fix button span).
      const innerOverflow = inner.scrollWidth > inner.clientWidth + 1;

      if (state.show) {
        if (innerOverflow) {
          state.hideThreshold = width;
          state.show = false;
          setShowRefresh(false);
        }
      } else if (width > state.hideThreshold + 40) {
        // Hysteresis of 40px: the refresh icon reclaims ~24px when hidden, so
        // we need enough extra headroom to avoid immediately re-hiding after
        // bringing refresh back.
        state.show = true;
        setShowRefresh(true);
      }
    };

    const observer = new ResizeObserver(check);
    observer.observe(container);
    observer.observe(inner);
    check();
    return () => observer.disconnect();
  }, []);

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
  const getErrorDescription = useCallback(
    (error: unknown) =>
      error instanceof Error ? error.message : t("errors.unknown"),
    [t],
  );
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
        title: t("toasts.renameSuccess.title"),
        description: t("toasts.renameSuccess.description", { title }),
        type: "success",
      });
      setRenameSessionGuid(null);
    } catch (error) {
      toastManager.add({
        title: t("toasts.renameError.title"),
        description: getErrorDescription(error),
        type: "error",
      });
    }
  }, [getErrorDescription, loadSessions, renameSessionGuid, renameValue, t]);

  const handleCloseSessionByGuid = useCallback(
    async (sessionGuid: string) => {
      try {
        await reviewWsApi.closeSession(sessionGuid);
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: t("toasts.closeError.title"),
          description: getErrorDescription(error),
          type: "error",
        });
      }
    },
    [getErrorDescription, loadSessions, t],
  );

  const handleArchiveSessionByGuid = useCallback(
    async (sessionGuid: string) => {
      try {
        await reviewWsApi.archiveSession(sessionGuid);
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: t("toasts.archiveError.title"),
          description: getErrorDescription(error),
          type: "error",
        });
      }
    },
    [getErrorDescription, loadSessions, t],
  );

  const handleActivateSessionByGuid = useCallback(
    async (sessionGuid: string) => {
      try {
        await reviewWsApi.activateSession(sessionGuid);
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: t("toasts.activateError.title"),
          description: getErrorDescription(error),
          type: "error",
        });
      }
    },
    [getErrorDescription, loadSessions, t],
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
              {s.title?.trim() || t("session.untitled")}
            </span>
            {activeSession && (
              <Check className="size-3.5 shrink-0 text-foreground" />
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[10rem]">
            {sortedRevisions.map((rev, idx) => {
              const activeRevision =
                activeSession && rev.guid === currentRevision?.guid;
              const label = t("revision.versionLabel", {
                number: sortedRevisions.length - idx,
              });

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
                    {rev.title?.trim() || t("revision.fallback")}
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
                {t("actions.activateSession")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => void handleCloseSessionByGuid(s.guid)}
              className="text-xs"
              disabled={s.status !== "active"}
            >
              {t("actions.closeSession")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void handleArchiveSessionByGuid(s.guid)}
              className="text-xs"
              disabled={s.status === "archived"}
            >
              {t("actions.archiveSession")}
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
                <span className="flex-1">{t("actions.rename")}</span>
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
                    className="px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-sidebar-accent cursor-pointer"
                  >
                    {t("actions.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSubmitRename()}
                    className="px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                  >
                    {t("actions.save")}
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
    <div ref={containerRef} className="flex min-w-0 flex-1 items-center gap-1 px-2">
      <div ref={innerRef} className="flex min-w-0 flex-1 items-center gap-1">
        <div className="flex min-w-0 max-w-[60%] shrink items-center">
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) setRenameSessionGuid(null);
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                title={currentSession?.title?.trim() || t("session.title")}
                className="min-w-0 max-w-full justify-start gap-1 rounded-md px-2 text-xs text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-foreground"
              >
                <span className="shrink-0 font-medium text-foreground">{revisionLabel}</span>
                <span className="min-w-0 truncate">
                  {currentSession?.title?.trim() || t("session.title")}
                </span>
                <ChevronDown className="size-3 shrink-0" />
              </Button>
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
                {t("actions.newSession")}
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
                          className="flex w-full items-center gap-1 text-left hover:text-foreground cursor-pointer"
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

        <FixActionsMenu
          disabled={fixDisabled}
          isLoading={isCreatingAgentRun}
          activeRun={activeFixRun}
          agentId={terminalAgentId}
          runConfig={terminalAgentRunConfig}
          runConfigByAgentId={terminalAgentRunConfigs}
          onAgentChange={setTerminalAgentId}
          onRunConfigChange={(nextAgentId, nextValue) => {
            setTerminalAgentRunConfig(nextAgentId, nextValue);
            setTerminalAgentId(nextAgentId);
          }}
          onFix={(agentId, runConfig) => handleRunAgentInTerminal(undefined, agentId, runConfig)}
          onCopyPrompt={() => handleCopyAgentPrompt()}
          onMarkFailed={(run) => handleMarkAgentRunFailed(run)}
          onOpenAgentReview={handleOpenAgentReview}
        />
      </div>

      {showRefresh && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="shrink-0 text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-foreground"
          aria-label={t("actions.refreshReviewData")}
          title={t("actions.refreshReviewData")}
        >
          {isRefreshing ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RotateCcw className="size-3.5" />
          )}
        </Button>
      )}
    </div>
  );
};
