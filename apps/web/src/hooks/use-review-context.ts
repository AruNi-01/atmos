"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { toastManager } from "@workspace/ui";
import {
  reviewWsApi,
  type ReviewFileDto,
  type ReviewAgentRunModel,
  type ReviewMessageDto,
  type ReviewSessionDto,
  type ReviewCommentDto,
} from "@/api/ws-api";
import { buildCommand, type AgentId } from "@/components/wiki/AgentSelect";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useAgentChatUrl } from "@/hooks/use-agent-chat-url";
import { useWebSocketStore } from "@/hooks/use-websocket";
import { useReviewTerminalRunnerStore } from "@/hooks/use-review-terminal-runner";
import {
  isOpenReviewCommentStatus,
  sortReviewSessions,
  sortComments,
  REVIEW_AGENT_STORAGE_KEY,
} from "@/components/diff/review/utils";

export type RunArtifactKind = "prompt" | "patch" | "summary";

export interface ArtifactPreview {
  runGuid: string;
  kind: RunArtifactKind;
  content: string;
}

interface UseReviewContextArgs {
  workspaceId: string | null;
  filePath: string;
  fileSnapshotGuid?: string | null;
}

function readStoredAgentId(): AgentId {
  if (typeof window === "undefined") return "codex";
  const stored = window.localStorage.getItem(REVIEW_AGENT_STORAGE_KEY);
  return stored ? (stored as AgentId) : "codex";
}

export function useReviewContext({ workspaceId, filePath, fileSnapshotGuid }: UseReviewContextArgs) {
  const onWsEvent = useWebSocketStore((state) => state.onEvent);
  const enqueueAgentChatPrompt = useDialogStore((state) => state.enqueueAgentChatPrompt);
  const setPendingAgentChatMode = useDialogStore(
    (state) => state.setPendingAgentChatMode,
  );
  const [, setAgentChatOpen] = useAgentChatUrl();
  const terminalRunner = useReviewTerminalRunnerStore((state) => state.runner);

  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingAgentRun, setIsCreatingAgentRun] = useState(false);
  const [isFinalizingRun, setIsFinalizingRun] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ReviewSessionDto[]>([]);
  const [selectedSessionGuid, setSelectedSessionGuid] = useQueryState(
    "reviewSession",
    parseAsString.withOptions({ history: "replace" }),
  );
  const [selectedRevisionGuid, setSelectedRevisionGuid] = useQueryState(
    "reviewRevision",
    parseAsString.withOptions({ history: "replace" }),
  );
  const [comments, setComments] = useState<ReviewCommentDto[]>([]);
  const [terminalAgentId, setTerminalAgentIdState] = useState<AgentId>(readStoredAgentId);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreview | null>(null);

  const setTerminalAgentId = useCallback((value: AgentId) => {
    setTerminalAgentIdState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(REVIEW_AGENT_STORAGE_KEY, value);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    if (!workspaceId) {
      setSessions([]);
      return;
    }
    setIsLoading(true);
    try {
      const nextSessions = await reviewWsApi.listSessions(workspaceId, true);
      setSessions(nextSessions);
    } catch (error) {
      console.error("Failed to load review sessions", error);
      toastManager.add({
        title: "Failed to load review sessions",
        description:
          error instanceof Error ? error.message : "Unknown review session error",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const unsubscribers = [
      onWsEvent("review_comment_updated", () => void loadSessions()),
      onWsEvent("review_message_created", () => void loadSessions()),
      onWsEvent("review_file_updated", () => void loadSessions()),
      onWsEvent("review_agent_run_updated", () => void loadSessions()),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadSessions, onWsEvent]);

  const currentSession = useMemo(() => {
    if (sessions.length === 0) return null;
    if (fileSnapshotGuid) {
      const snapshotSession = sessions.find((session) =>
        session.revisions.some((revision) =>
          revision.files.some((file) => file.snapshot.guid === fileSnapshotGuid),
        ),
      );
      if (snapshotSession) return snapshotSession;
    }
    if (selectedSessionGuid) {
      return sessions.find((session) => session.guid === selectedSessionGuid) ?? null;
    }
    return (
      sessions.find((session) => session.status === "active") ??
      sortReviewSessions(sessions)[0]
    );
  }, [fileSnapshotGuid, selectedSessionGuid, sessions]);

  // Note: We intentionally do NOT sync currentSession back to URL here.
  // The URL is the source of truth for user selection; currentSession
  // is computed from URL + available sessions.

  const currentRevision = useMemo(() => {
    if (!currentSession) return null;
    if (fileSnapshotGuid) {
      const snapshotRevision = currentSession.revisions.find((revision) =>
        revision.files.some((file) => file.snapshot.guid === fileSnapshotGuid),
      );
      if (snapshotRevision) return snapshotRevision;
    }
    return (
      currentSession.revisions.find(
        (revision) =>
          revision.guid === (selectedRevisionGuid ?? currentSession.current_revision_guid),
      ) ?? currentSession.revisions[0] ?? null
    );
  }, [currentSession, fileSnapshotGuid, selectedRevisionGuid]);

  // Auto-switch to latest revision when session creates a new one (e.g., after finalize)
  const prevLatestRevisionGuidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentSession) return;
    const latestGuid = currentSession.current_revision_guid;
    const prevLatest = prevLatestRevisionGuidRef.current;
    prevLatestRevisionGuidRef.current = latestGuid;
    // Only update URL when a new revision is created (not on initial load)
    if (prevLatest !== null && prevLatest !== latestGuid) {
      void setSelectedRevisionGuid(latestGuid);
    }
  }, [currentSession, setSelectedRevisionGuid]);

  const currentFile = useMemo<ReviewFileDto | null>(() => {
    if (!currentRevision) return null;
    if (fileSnapshotGuid) {
      return (
        currentRevision.files.find((file) => file.snapshot.guid === fileSnapshotGuid) ?? null
      );
    }
    return (
      currentRevision.files.find((file) => file.snapshot.file_path === filePath) ?? null
    );
  }, [currentRevision, filePath, fileSnapshotGuid]);

  const loadComments = useCallback(async () => {
    if (!currentSession) {
      setComments([]);
      return;
    }
    try {
      const nextComments = await reviewWsApi.listComments({
        sessionGuid: currentSession.guid,
        revisionGuid: currentRevision?.guid ?? null,
      });
      setComments(nextComments);
    } catch (error) {
      console.error("Failed to load review comments", error);
    }
  }, [currentRevision?.guid, currentSession]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  useEffect(() => {
    const unsubscribers = [
      onWsEvent("review_comment_updated", () => void loadComments()),
      onWsEvent("review_message_created", () => void loadComments()),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadComments, onWsEvent]);

  const canEdit =
    currentSession?.status === "active" &&
    !!currentRevision &&
    currentRevision.guid === currentSession.current_revision_guid;

  const currentFileComments = useMemo(() => {
    if (!currentFile) return [];
    return comments.filter(
      (comment) => comment.file_snapshot_guid === currentFile.snapshot.guid,
    );
  }, [currentFile, comments]);

  const openCurrentFileComments = useMemo(
    () =>
      currentFileComments.filter((comment) =>
        isOpenReviewCommentStatus(comment.status),
      ),
    [currentFileComments],
  );

  const openRevisionComments = useMemo(
    () =>
      comments.filter((comment) =>
        isOpenReviewCommentStatus(comment.status),
      ),
    [comments],
  );

  const sortedComments = useMemo(
    () => sortComments(comments, currentFile?.snapshot.guid ?? null),
    [currentFile?.snapshot.guid, comments],
  );

  const fileRevisionEntries = useMemo(() => {
    if (!currentSession) return [];
    return currentSession.revisions
      .map((revision) => {
        const file = revision.files.find((item) => item.snapshot.file_path === filePath);
        return file ? { revision, file } : null;
      })
      .filter(
        (
          item,
        ): item is {
          revision: ReviewSessionDto["revisions"][number];
          file: ReviewFileDto;
        } => Boolean(item),
      );
  }, [currentSession, filePath]);

  const latestSummaryRun = useMemo(
    () => {
      if (!currentSession || !currentRevision) return null;
      return currentSession.runs.find((run) =>
        !!run.summary_rel_path && run.result_revision_guid === currentRevision.guid,
      ) ?? null;
    },
    [currentSession, currentRevision],
  );

  const activeAgentRun = useMemo(
    () => currentSession?.runs.find((run) => run.status === "running") ?? null,
    [currentSession],
  );

  const activeReviewRun = useMemo(
    () => currentSession?.runs.find((run) => run.status === "running" && run.run_kind === "review") ?? null,
    [currentSession],
  );

  const activeFixRun = useMemo(
    () => currentSession?.runs.find((run) => run.status === "running" && run.run_kind === "fix") ?? null,
    [currentSession],
  );

  useEffect(() => {
    const hasUnfinishedRun = currentSession?.runs.some((run) =>
      run.status === "pending" || run.status === "running",
    );
    if (!hasUnfinishedRun) return;
    const interval = window.setInterval(() => {
      void loadSessions();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [currentSession, loadSessions]);

  const autoLoadedSummaryRunRef = useRef<string | null>(null);

  const handleCreateSession = useCallback(async () => {
    if (!workspaceId) return;
    setIsCreating(true);
    try {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const defaultTitle = `Review_${mm}.${dd}-${hh}:${min}`;
      const session = await reviewWsApi.createSession({
        workspaceGuid: workspaceId,
        title: defaultTitle,
      });
      setSelectedSessionGuid(session.guid);
      setSelectedRevisionGuid(session.current_revision_guid);
      setSessions((prev) => [session, ...prev]);
      toastManager.add({
        title: "Review session started",
        description: "Comments and reviewed file state are now tracked for this workspace.",
        type: "success",
      });
    } catch (error) {
      toastManager.add({
        title: "Failed to create review session",
        description:
          error instanceof Error ? error.message : "Unknown review session error",
        type: "error",
      });
    } finally {
      setIsCreating(false);
    }
  }, [workspaceId]);

  const handleCloseSession = useCallback(async () => {
    if (!currentSession) return;
    try {
      await reviewWsApi.closeSession(currentSession.guid);
      await loadSessions();
    } catch (error) {
      toastManager.add({
        title: "Failed to close session",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  }, [currentSession, loadSessions]);

  const handleArchiveSession = useCallback(async () => {
    if (!currentSession) return;
    try {
      await reviewWsApi.archiveSession(currentSession.guid);
      await loadSessions();
    } catch (error) {
      toastManager.add({
        title: "Failed to archive session",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  }, [currentSession, loadSessions]);

  const handleRenameSession = useCallback(
    async (title: string) => {
      if (!currentSession) return;
      try {
        await reviewWsApi.renameSession(currentSession.guid, title);
        await loadSessions();
        toastManager.add({
          title: "Session renamed",
          description: `Session renamed to "${title}"`,
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title: "Failed to rename session",
          description:
            error instanceof Error ? error.message : "Unknown error",
          type: "error",
        });
      }
    },
    [currentSession, loadSessions],
  );

  const handleToggleReviewed = useCallback(
    async (file: ReviewFileDto, checked: boolean) => {
      try {
        await reviewWsApi.setFileReviewed({
          fileStateGuid: file.state.guid,
          reviewed: checked,
        });
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to update file review state",
          description:
            error instanceof Error ? error.message : "Unknown review state error",
          type: "error",
        });
      }
    },
    [loadSessions],
  );

  const handleUpdateCommentStatus = useCallback(
    async (commentGuid: string, status: string) => {
      try {
        await reviewWsApi.updateCommentStatus(commentGuid, status);
        await loadComments();
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to update comment status",
          description:
            error instanceof Error ? error.message : "Unknown review comment error",
          type: "error",
        });
      }
    },
    [loadSessions, loadComments],
  );

  const handleReplyToComment = useCallback(
    async (comment: ReviewCommentDto, body: string) => {
      const trimmedBody = body.trim();
      if (!trimmedBody) {
        toastManager.add({
          title: "Reply is empty",
          description: "Write a short reply before sending.",
          type: "error",
        });
        return;
      }

      try {
        await reviewWsApi.addMessage({
          commentGuid: comment.guid,
          authorType: "user",
          kind: "reply",
          body: trimmedBody,
        });
        if (comment.status !== "open") {
          await reviewWsApi.updateCommentStatus(comment.guid, "open");
        }
        await loadComments();
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to reply to comment",
          description:
            error instanceof Error ? error.message : "Unknown review comment error",
          type: "error",
        });
        throw error;
      }
    },
    [loadSessions, loadComments],
  );

  const handleDeleteMessage = useCallback(
    async (_comment: ReviewCommentDto, message: ReviewMessageDto) => {
      try {
        await reviewWsApi.deleteMessage(message.guid);
        await loadComments();
        await loadSessions();
        toastManager.add({
          title: "Comment deleted",
          description: "The comment message was removed.",
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title: "Failed to delete comment",
          description:
            error instanceof Error ? error.message : "Unknown review comment error",
          type: "error",
        });
        throw error;
      }
    },
    [loadSessions, loadComments],
  );

  const handleUpdateMessage = useCallback(
    async (message: ReviewMessageDto, body: string) => {
      const trimmedBody = body.trim();
      if (!trimmedBody) return;
      try {
        await reviewWsApi.updateMessage(message.guid, trimmedBody);
        await loadComments();
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to update comment",
          description:
            error instanceof Error ? error.message : "Unknown review comment error",
          type: "error",
        });
        throw error;
      }
    },
    [loadSessions, loadComments],
  );

  const createAgentRun = useCallback(
    async (
      runKind: "review" | "fix",
      executionMode: "copy_prompt" | "agent_chat" | "terminal_cli",
      skillId?: string | null,
      selectedCommentGuids?: string[],
    ) => {
      if (!currentSession || !currentRevision) return null;
      return reviewWsApi.createAgentRun({
        sessionGuid: currentSession.guid,
        baseRevisionGuid: currentRevision.guid,
        runKind,
        executionMode,
        skillId: skillId ?? null,
        selectedCommentGuids,
      });
    },
    [currentRevision, currentSession],
  );

  const handleMarkAgentRunFailed = useCallback(
    async (run: ReviewAgentRunModel, message = "Marked failed by user") => {
      if (
        typeof window !== "undefined" &&
        !window.confirm("Mark this review fix run as failed?")
      ) {
        return;
      }
      try {
        await reviewWsApi.setAgentRunStatus({
          runGuid: run.guid,
          status: "failed",
          message,
        });
        await loadSessions();
        toastManager.add({
          title: "Fix run marked failed",
          description: "You can start another review fix run now.",
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title: "Failed to update fix run",
          description:
            error instanceof Error ? error.message : "Unknown review fix error",
          type: "error",
        });
      }
    },
    [loadSessions],
  );

  const handleCopyAgentPrompt = useCallback(
    async (selectedCommentGuids?: string[]) => {
      setIsCreatingAgentRun(true);
      try {
        const result = await createAgentRun("fix", "copy_prompt", null, selectedCommentGuids);
        if (!result) return;
        setSelectedRevisionGuid(result.revision.guid);
        await navigator.clipboard.writeText(result.prompt);
        toastManager.add({
          title: "Fix prompt copied",
          description: "Paste it into your agent CLI or chat to process the review comments.",
          type: "success",
        });
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to create fix run",
          description:
            error instanceof Error ? error.message : "Unknown fix run error",
          type: "error",
        });
      } finally {
        setIsCreatingAgentRun(false);
      }
    },
    [createAgentRun, loadSessions, setSelectedRevisionGuid],
  );

  const handleSendAgentRunToAgentChat = useCallback(
    async (selectedCommentGuids?: string[]) => {
      if (!workspaceId) return;
      setIsCreatingAgentRun(true);
      try {
        const result = await createAgentRun("fix", "agent_chat", null, selectedCommentGuids);
        if (!result) return;
        setSelectedRevisionGuid(result.revision.guid);
        enqueueAgentChatPrompt({
          prompt: result.prompt,
          workspaceId,
          projectId: null,
          mode: "default",
          origin: "review_session",
          sessionTitle: `Review Fix ${filePath.split("/").pop() || filePath}`,
          forceNewSession: false,
        });
        setPendingAgentChatMode("default");
        await setAgentChatOpen(true);
        toastManager.add({
          title: "Queued in Agent Chat",
          description: "The review fix prompt has been added to the current workspace chat queue.",
          type: "success",
        });
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to queue fix run",
          description:
            error instanceof Error ? error.message : "Unknown review fix error",
          type: "error",
        });
      } finally {
        setIsCreatingAgentRun(false);
      }
    },
    [
      createAgentRun,
      enqueueAgentChatPrompt,
      filePath,
      loadSessions,
      setSelectedRevisionGuid,
      setAgentChatOpen,
      setPendingAgentChatMode,
      workspaceId,
    ],
  );

  const handleRunAgentInTerminal = useCallback(
    async (selectedCommentGuids?: string[], agentIdOverride?: AgentId) => {
      setIsCreatingAgentRun(true);
      try {
        const result = await createAgentRun("fix", "terminal_cli", null, selectedCommentGuids);
        if (!result) return;
        setSelectedRevisionGuid(result.revision.guid);
        const agentId = agentIdOverride ?? terminalAgentId;
        const command = buildCommand(agentId, result.prompt);
        const label = `Review Fix ${filePath.split("/").pop() || "Run"}`;
        if (terminalRunner) {
          await terminalRunner(command, label);
          toastManager.add({
            title: "Started in terminal",
            description: "A terminal agent session was opened with the review-fix prompt.",
            type: "success",
          });
        } else {
          await navigator.clipboard.writeText(command);
          toastManager.add({
            title: "Terminal command copied",
            description: "Paste the command into a terminal agent to execute the review fix run.",
            type: "success",
          });
        }
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to launch terminal fix run",
          description:
            error instanceof Error ? error.message : "Unknown review fix error",
          type: "error",
        });
      } finally {
        setIsCreatingAgentRun(false);
      }
    },
    [createAgentRun, filePath, loadSessions, setSelectedRevisionGuid, terminalAgentId, terminalRunner],
  );

  const handleRunAgentReview = useCallback(
    async (skillId?: string, executionMode: "copy_prompt" | "agent_chat" = "copy_prompt") => {
      if (!currentSession || !currentRevision) return null;
      const effectiveSkillId = skillId ?? "fullstack-reviewer";
      setIsCreatingAgentRun(true);
      try {
        const result = await createAgentRun("review", executionMode, effectiveSkillId);
        if (!result) return;
        setSelectedRevisionGuid(result.revision.guid);
        if (executionMode === "copy_prompt") {
          await navigator.clipboard.writeText(result.prompt);
          toastManager.add({
            title: "Review prompt copied",
            description: "Paste it into your agent CLI or chat to process the review.",
            type: "success",
          });
        } else if (executionMode === "agent_chat" && workspaceId) {
          enqueueAgentChatPrompt({
            prompt: result.prompt,
            workspaceId,
            projectId: null,
            mode: "default",
            origin: "review_session",
            sessionTitle: `Review ${filePath.split("/").pop() || filePath}`,
            forceNewSession: false,
          });
          setAgentChatOpen(true);
          setPendingAgentChatMode("default");
        }
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to create review run",
          description:
            error instanceof Error ? error.message : "Unknown review error",
          type: "error",
        });
      } finally {
        setIsCreatingAgentRun(false);
      }
    },
    [createAgentRun, currentRevision, currentSession, filePath, loadSessions, setSelectedRevisionGuid, workspaceId, enqueueAgentChatPrompt, setAgentChatOpen, setPendingAgentChatMode],
  );

  const handleCopyAgentReviewPrompt = useCallback(
    async (skillId?: string) => {
      await handleRunAgentReview(skillId, "copy_prompt");
    },
    [handleRunAgentReview],
  );

  const handleFinalizeRun = useCallback(
    async (run: ReviewAgentRunModel) => {
      setIsFinalizingRun(run.guid);
      try {
        const result = await reviewWsApi.finalizeAgentRun({
          runGuid: run.guid,
          title: `Fix Result ${new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`,
        });
        await loadSessions();
        setSelectedRevisionGuid(result.revision.guid);
        toastManager.add({
          title: "Fix run finalized",
          description: "The review revision snapshot has been updated with the current workspace.",
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title: "Failed to finalize fix run",
          description:
            error instanceof Error ? error.message : "Unknown finalize error",
          type: "error",
        });
      } finally {
        setIsFinalizingRun(null);
      }
    },
    [loadSessions],
  );

  const handlePreviewArtifact = useCallback(
    async (runGuid: string, kind: RunArtifactKind) => {
      setArtifactLoading(true);
      try {
        const artifact = await reviewWsApi.getRunArtifact({ runGuid, kind });
        setArtifactPreview({
          runGuid,
          kind,
          content: artifact.content,
        });
      } catch (error) {
        toastManager.add({
          title: "Failed to load run artifact",
          description:
            error instanceof Error ? error.message : "Unknown review artifact error",
          type: "error",
        });
      } finally {
        setArtifactLoading(false);
      }
    },
    [],
  );

  return {
    // State
    sessions,
    currentSession,
    currentRevision,
    currentFile,
    comments,
    sortedComments,
    openCurrentFileComments,
    openRevisionComments,
    fileRevisionEntries,
    activeAgentRun,
    activeReviewRun,
    activeFixRun,
    canEdit,
    isLoading,
    isCreating,
    isCreatingAgentRun,
    isFinalizingRun,
    latestSummaryRun,
    artifactPreview,
    artifactLoading,
    selectedSessionGuid,
    selectedRevisionGuid,
    terminalAgentId,
    autoLoadedSummaryRunRef,
    // Setters
    setSelectedSessionGuid,
    setSelectedRevisionGuid,
    setArtifactPreview,
    setTerminalAgentId,
    // Handlers
    loadSessions,
    loadComments,
    handleCreateSession,
    handleCloseSession,
    handleArchiveSession,
    handleRenameSession,
    handleToggleReviewed,
    handleUpdateCommentStatus,
    handleReplyToComment,
    handleUpdateMessage,
    handleDeleteMessage,
    createAgentRun,
    handleCopyAgentPrompt,
    handleSendAgentRunToAgentChat,
    handleRunAgentInTerminal,
    handleRunAgentReview,
    handleCopyAgentReviewPrompt,
    handleMarkAgentRunFailed,
    handleFinalizeRun,
    handlePreviewArtifact,
  };
}

export type ReviewContext = ReturnType<typeof useReviewContext>;
