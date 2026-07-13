"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useQueryState, parseAsString } from "nuqs";
import { toastManager } from "@workspace/ui";
import {
  reviewWsApi,
  type ReviewFileDto,
  type ReviewAgentRunModel,
  type ReviewMessageDto,
  type ReviewSessionDto,
  type ReviewCommentDto,
  type ReviewTarget,
  type ReviewAnchor,
} from "@/api/ws-api";
import { getComputerQueryScope } from "@/api/query/query-scope";
import { buildCommand, type AgentId } from "@/features/wiki/components/AgentSelect";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import { useAgentChatUrl } from "@/features/agent/hooks/use-agent-chat-url";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { useReviewSessionsQuery } from "@/features/code-review/hooks/use-review-sessions-query";
import { reviewSessionsKey } from "@/features/code-review/lib/review-query-options";
import { useReviewTerminalRunnerStore } from "@/features/code-review/store/review-terminal-runner-store";
import type { TerminalAgentRunConfigInput } from "@/features/agent/lib/terminal-agent-run-config";
import {
  isOpenReviewCommentStatus,
  sortReviewSessions,
  sortComments,
} from "@/features/diff/components/review/utils";
import { useReviewDefaultAgentId } from "@/shared/stores/use-ui-pref-hooks";

export type RunArtifactKind = "prompt" | "patch" | "summary";

export interface ArtifactPreview {
  runGuid: string;
  kind: RunArtifactKind;
  content: string;
}

interface UseReviewContextArgs {
  target: ReviewTarget | null;
  filePath: string;
  fileSnapshotGuid?: string | null;
  revisionGuid?: string | null;
  selectionMode?: "url" | "local";
  initialSessionGuid?: string | null;
  initialRevisionGuid?: string | null;
}

export function useReviewContext({
  target,
  filePath,
  fileSnapshotGuid,
  revisionGuid,
  selectionMode = "url",
  initialSessionGuid = null,
  initialRevisionGuid = null,
}: UseReviewContextArgs) {
  const t = useTranslations("codeReview.reviewContext");
  const locale = useLocale();
  const loadSessionsErrorTextRef = useRef({
    title: t("loadSessions.errorTitle"),
    unknownReviewSession: t("errors.unknownReviewSession"),
  });
  const [storedReviewAgentId, setStoredReviewAgentId] = useReviewDefaultAgentId();
  const queryClient = useQueryClient();
  const onWsEvent = useWebSocketStore((state) => state.onEvent);
  const enqueueAgentChatPrompt = useDialogStore((state) => state.enqueueAgentChatPrompt);
  const setPendingAgentChatMode = useDialogStore(
    (state) => state.setPendingAgentChatMode,
  );
  const [, setAgentChatOpen] = useAgentChatUrl();
  const terminalRunner = useReviewTerminalRunnerStore((state) => state.runner);

  const sessionsQuery = useReviewSessionsQuery(target);
  const sessions = sessionsQuery.data ?? [];
  const isLoading = sessionsQuery.isLoading;
  const sessionsLoadError = sessionsQuery.error;
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingAgentRun, setIsCreatingAgentRun] = useState(false);
  const [isFinalizingRun, setIsFinalizingRun] = useState<string | null>(null);
  const [urlSelectedSessionGuid, setUrlSelectedSessionGuid] = useQueryState(
    "reviewSession",
    parseAsString.withOptions({ history: "replace" }),
  );
  const [urlSelectedRevisionGuid, setUrlSelectedRevisionGuid] = useQueryState(
    "reviewRevision",
    parseAsString.withOptions({ history: "replace" }),
  );
  const [localSelectedSessionGuid, setLocalSelectedSessionGuid] = useState<string | null>(
    initialSessionGuid,
  );
  const [localSelectedRevisionGuid, setLocalSelectedRevisionGuid] = useState<string | null>(
    initialRevisionGuid ?? revisionGuid ?? null,
  );
  const [comments, setComments] = useState<ReviewCommentDto[]>([]);
  const terminalAgentId = (storedReviewAgentId ?? "codex") as AgentId;
  const [terminalAgentRunConfigs, setTerminalAgentRunConfigs] = useState<Record<string, TerminalAgentRunConfigInput | null>>({});
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreview | null>(null);
  const terminalAgentRunConfig = terminalAgentRunConfigs[terminalAgentId] ?? null;

  useEffect(() => {
    if (selectionMode !== "local") return;
    setLocalSelectedSessionGuid(initialSessionGuid ?? null);
  }, [initialSessionGuid, selectionMode]);

  useEffect(() => {
    if (selectionMode !== "local") return;
    setLocalSelectedRevisionGuid(initialRevisionGuid ?? revisionGuid ?? null);
  }, [initialRevisionGuid, revisionGuid, selectionMode]);

  const selectedSessionGuid =
    selectionMode === "local" ? localSelectedSessionGuid : urlSelectedSessionGuid;
  const selectedRevisionGuid =
    selectionMode === "local" ? localSelectedRevisionGuid : urlSelectedRevisionGuid;
  const pinnedRevisionGuid = selectionMode === "local" ? null : revisionGuid;

  const setSelectedSessionGuid = useCallback(
    (value: string | null) => {
      if (selectionMode === "local") {
        setLocalSelectedSessionGuid(value);
        return;
      }
      void setUrlSelectedSessionGuid(value);
    },
    [selectionMode, setUrlSelectedSessionGuid],
  );

  const setSelectedRevisionGuid = useCallback(
    (value: string | null) => {
      if (selectionMode === "local") {
        setLocalSelectedRevisionGuid(value);
        return;
      }
      void setUrlSelectedRevisionGuid(value);
    },
    [selectionMode, setUrlSelectedRevisionGuid],
  );

  const setTerminalAgentId = useCallback(
    (value: AgentId) => {
      setStoredReviewAgentId(value);
    },
    [setStoredReviewAgentId],
  );

  const setTerminalAgentRunConfig = useCallback(
    (agentId: AgentId, value: TerminalAgentRunConfigInput | null) => {
      setTerminalAgentRunConfigs((prev) => ({
        ...prev,
        [agentId]: value,
      }));
    },
    [],
  );

  useEffect(() => {
    loadSessionsErrorTextRef.current = {
      title: t("loadSessions.errorTitle"),
      unknownReviewSession: t("errors.unknownReviewSession"),
    };
  }, [t]);

  const loadSessions = useCallback(async () => {
    if (!target) return;
    await queryClient.invalidateQueries({
      queryKey: reviewSessionsKey(getComputerQueryScope(), target),
      refetchType: "active",
    });
  }, [queryClient, target]);

  const toastedSessionsErrorRef = useRef<unknown>(null);
  useEffect(() => {
    if (!sessionsLoadError) {
      toastedSessionsErrorRef.current = null;
      return;
    }
    if (toastedSessionsErrorRef.current === sessionsLoadError) return;
    toastedSessionsErrorRef.current = sessionsLoadError;
    console.error("Failed to load review sessions", sessionsLoadError);
    toastManager.add({
      title: loadSessionsErrorTextRef.current.title,
      description:
        sessionsLoadError instanceof Error
          ? sessionsLoadError.message
          : loadSessionsErrorTextRef.current.unknownReviewSession,
      type: "error",
    });
  }, [sessionsLoadError]);

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
    if (pinnedRevisionGuid) {
      const revisionSession = sessions.find((session) =>
        session.revisions.some((revision) => revision.guid === pinnedRevisionGuid),
      );
      if (revisionSession) return revisionSession;
    }
    if (selectedRevisionGuid) {
      const revisionSession = sessions.find((session) =>
        session.revisions.some((revision) => revision.guid === selectedRevisionGuid),
      );
      if (revisionSession) return revisionSession;
    }
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
  }, [fileSnapshotGuid, pinnedRevisionGuid, selectedRevisionGuid, selectedSessionGuid, sessions]);

  // Note: We intentionally do NOT sync currentSession back to URL here.
  // The URL is the source of truth for user selection; currentSession
  // is computed from URL + available sessions.

  const currentRevision = useMemo(() => {
    if (!currentSession) return null;
    if (pinnedRevisionGuid) {
      const explicitRevision =
        currentSession.revisions.find((revision) => revision.guid === pinnedRevisionGuid) ?? null;
      if (explicitRevision) return explicitRevision;
    }
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
  }, [currentSession, fileSnapshotGuid, pinnedRevisionGuid, selectedRevisionGuid]);

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
      setComments((prev) => {
        const optimistic = prev.filter((c) => c.guid.startsWith("opt-"));
        const filteredOptimistic = optimistic.filter((opt) => {
          const isSaved = nextComments.some(
            (c) =>
              c.file_snapshot_guid === opt.file_snapshot_guid &&
              c.anchor_start_line === opt.anchor_start_line &&
              c.anchor_end_line === opt.anchor_end_line &&
              c.anchor_side === opt.anchor_side &&
              c.messages[0]?.body === opt.messages[0]?.body
          );
          return !isSaved;
        });
        return [...nextComments, ...filteredOptimistic];
      });
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
    if (!target) return;
    setIsCreating(true);
    try {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const defaultTitle = t("createSession.defaultTitle", {
        timestamp: `${mm}.${dd}-${hh}:${min}`,
      });
      const session = await reviewWsApi.createSession({
        target,
        title: defaultTitle,
      });
      setSelectedSessionGuid(session.guid);
      setSelectedRevisionGuid(session.current_revision_guid);
      queryClient.setQueryData<ReviewSessionDto[]>(
        reviewSessionsKey(getComputerQueryScope(), target),
        (prev) => [session, ...(prev ?? [])],
      );
      const targetKind = target.kind === "workspace" ? "workspace" : "project";
      toastManager.add({
        title: t("createSession.successTitle"),
        description: t("createSession.successDescription", {
          targetKind: t(`targetKinds.${targetKind}`),
        }),
        type: "success",
      });
    } catch (error) {
      toastManager.add({
        title: t("createSession.errorTitle"),
        description:
          error instanceof Error
            ? error.message
            : t("errors.unknownReviewSession"),
        type: "error",
      });
    } finally {
      setIsCreating(false);
    }
  }, [queryClient, setSelectedRevisionGuid, setSelectedSessionGuid, t, target]);

  const handleCloseSession = useCallback(async () => {
    if (!currentSession) return;
    try {
      await reviewWsApi.closeSession(currentSession.guid);
      await loadSessions();
    } catch (error) {
      toastManager.add({
        title: t("closeSession.errorTitle"),
        description:
          error instanceof Error ? error.message : t("errors.unknown"),
        type: "error",
      });
    }
  }, [currentSession, loadSessions, t]);

  const handleArchiveSession = useCallback(async () => {
    if (!currentSession) return;
    try {
      await reviewWsApi.archiveSession(currentSession.guid);
      await loadSessions();
    } catch (error) {
      toastManager.add({
        title: t("archiveSession.errorTitle"),
        description:
          error instanceof Error ? error.message : t("errors.unknown"),
        type: "error",
      });
    }
  }, [currentSession, loadSessions, t]);

  const handleRenameSession = useCallback(
    async (title: string) => {
      if (!currentSession) return;
      try {
        await reviewWsApi.renameSession(currentSession.guid, title);
        await loadSessions();
        toastManager.add({
          title: t("renameSession.successTitle"),
          description: t("renameSession.successDescription", { title }),
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title: t("renameSession.errorTitle"),
          description:
            error instanceof Error ? error.message : t("errors.unknown"),
          type: "error",
        });
      }
    },
    [currentSession, loadSessions, t],
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
          title: t("toggleReviewed.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("errors.unknownReviewState"),
          type: "error",
        });
      }
    },
    [loadSessions, t],
  );

  const handleUpdateCommentStatus = useCallback(
    async (commentGuid: string, status: string) => {
      try {
        await reviewWsApi.updateCommentStatus(commentGuid, status);
        await loadComments();
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: t("updateCommentStatus.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("errors.unknownReviewComment"),
          type: "error",
        });
      }
    },
    [loadSessions, loadComments, t],
  );

  const handleCreateComment = useCallback(
    async (data: {
      sessionGuid: string;
      revisionGuid: string;
      fileSnapshotGuid: string;
      anchor: ReviewAnchor;
      body: string;
      title?: string | null;
      createdBy?: string | null;
      parentCommentGuid?: string | null;
    }) => {
      const tempGuid = `opt-${Math.random().toString(36).substring(2, 11)}`;
      const optComment: ReviewCommentDto = {
        guid: tempGuid,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false,
        session_guid: data.sessionGuid,
        revision_guid: data.revisionGuid,
        file_snapshot_guid: data.fileSnapshotGuid,
        anchor_side: data.anchor.side,
        anchor_start_line: data.anchor.start_line,
        anchor_end_line: data.anchor.end_line,
        anchor_line_range_kind: data.anchor.line_range_kind,
        anchor_json: JSON.stringify(data.anchor),
        status: "open",
        parent_comment_guid: data.parentCommentGuid ?? null,
        title: data.title ?? null,
        created_by: data.createdBy ?? "user",
        fixed_at: null,
        anchor: data.anchor,
        messages: [
          {
            guid: `opt-msg-${Math.random().toString(36).substring(2, 11)}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_deleted: false,
            comment_guid: tempGuid,
            author_type: "user",
            kind: "reply",
            body_storage_kind: "inline",
            body: data.body,
            body_full: data.body,
            body_rel_path: null,
            agent_run_guid: null,
          },
        ],
      };

      setComments((prev) => [...prev, optComment]);

      try {
        const realComment = await reviewWsApi.createComment(data);
        setComments((prev) =>
          prev.map((c) => (c.guid === tempGuid ? realComment : c)),
        );
        void loadSessions();
        return realComment;
      } catch (error) {
        setComments((prev) => prev.filter((c) => c.guid !== tempGuid));
        throw error;
      }
    },
    [loadSessions],
  );

  const handleReplyToComment = useCallback(
    async (comment: ReviewCommentDto, body: string) => {
      const trimmedBody = body.trim();
      if (!trimmedBody) {
        toastManager.add({
          title: t("reply.emptyTitle"),
          description: t("reply.emptyDescription"),
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
          title: t("reply.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("errors.unknownReviewComment"),
          type: "error",
        });
        throw error;
      }
    },
    [loadSessions, loadComments, t],
  );

  const handleDeleteMessage = useCallback(
    async (_comment: ReviewCommentDto, message: ReviewMessageDto) => {
      try {
        await reviewWsApi.deleteMessage(message.guid);
        await loadComments();
        await loadSessions();
        toastManager.add({
          title: t("deleteMessage.successTitle"),
          description: t("deleteMessage.successDescription"),
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title: t("deleteMessage.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("errors.unknownReviewComment"),
          type: "error",
        });
        throw error;
      }
    },
    [loadSessions, loadComments, t],
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
          title: t("updateMessage.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("errors.unknownReviewComment"),
          type: "error",
        });
        throw error;
      }
    },
    [loadSessions, loadComments, t],
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
    async (
      run: ReviewAgentRunModel,
      message = t("markAgentRunFailed.defaultMessage"),
    ) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm(t("markAgentRunFailed.confirm"))
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
          title: t("markAgentRunFailed.successTitle"),
          description: t("markAgentRunFailed.successDescription"),
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title: t("markAgentRunFailed.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("errors.unknownReviewFix"),
          type: "error",
        });
      }
    },
    [loadSessions, t],
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
          title: t("copyAgentPrompt.successTitle"),
          description: t("copyAgentPrompt.successDescription"),
          type: "success",
        });
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: t("copyAgentPrompt.errorTitle"),
          description:
            error instanceof Error ? error.message : t("errors.unknownFixRun"),
          type: "error",
        });
      } finally {
        setIsCreatingAgentRun(false);
      }
    },
    [createAgentRun, loadSessions, setSelectedRevisionGuid, t],
  );

  const handleSendAgentRunToAgentChat = useCallback(
    async (selectedCommentGuids?: string[]) => {
      if (!target) return;
      const workspaceId = target.kind === "workspace" ? target.workspaceId : null;
      const projectId = target.kind === "project" ? target.projectId : null;
      setIsCreatingAgentRun(true);
      try {
        const result = await createAgentRun("fix", "agent_chat", null, selectedCommentGuids);
        if (!result) return;
        setSelectedRevisionGuid(result.revision.guid);
        enqueueAgentChatPrompt({
          prompt: result.prompt,
          workspaceId,
          projectId,
          mode: "default",
          origin: "review_session",
          sessionTitle: t("agentChat.sessionTitle", {
            fileName: filePath.split("/").pop() || filePath,
          }),
          forceNewSession: false,
        });
        setPendingAgentChatMode("default");
        await setAgentChatOpen(true);
        toastManager.add({
          title: t("agentChat.successTitle"),
          description: t("agentChat.successDescription"),
          type: "success",
        });
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: t("agentChat.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("errors.unknownReviewFix"),
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
      t,
      target,
    ],
  );

  const handleRunAgentInTerminal = useCallback(
    async (
      selectedCommentGuids?: string[],
      agentIdOverride?: AgentId,
      runConfigOverride?: TerminalAgentRunConfigInput | null,
    ) => {
      setIsCreatingAgentRun(true);
      try {
        const result = await createAgentRun("fix", "terminal_cli", null, selectedCommentGuids);
        if (!result) return;
        setSelectedRevisionGuid(result.revision.guid);
        const agentId = agentIdOverride ?? terminalAgentId;
        const runConfig = runConfigOverride ?? terminalAgentRunConfigs[agentId] ?? null;
        const command = buildCommand(agentId, result.prompt, runConfig);
        const label = t("terminal.label", {
          fileName: filePath.split("/").pop() || t("terminal.fallbackRunName"),
        });
        if (terminalRunner) {
          await terminalRunner(command, label);
          toastManager.add({
            title: t("terminal.startedTitle"),
            description: t("terminal.startedDescription"),
            type: "success",
          });
        } else {
          await navigator.clipboard.writeText(command);
          toastManager.add({
            title: t("terminal.copiedTitle"),
            description: t("terminal.copiedDescription"),
            type: "success",
          });
        }
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: t("terminal.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("errors.unknownReviewFix"),
          type: "error",
        });
      } finally {
        setIsCreatingAgentRun(false);
      }
    },
    [createAgentRun, filePath, loadSessions, setSelectedRevisionGuid, t, terminalAgentId, terminalAgentRunConfigs, terminalRunner],
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
            title: t("runAgentReview.copySuccessTitle"),
            description: t("runAgentReview.copySuccessDescription"),
            type: "success",
          });
        } else if (executionMode === "agent_chat" && target) {
          const workspaceId = target.kind === "workspace" ? target.workspaceId : null;
          const projectId = target.kind === "project" ? target.projectId : null;
          setPendingAgentChatMode("default");
          setAgentChatOpen(true);
          await enqueueAgentChatPrompt({
            prompt: result.prompt,
            workspaceId,
            projectId,
            mode: "default",
            origin: "review_session",
            sessionTitle: t("runAgentReview.sessionTitle", {
              fileName: filePath.split("/").pop() || filePath,
            }),
            forceNewSession: false,
          });
        }
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: t("runAgentReview.errorTitle"),
          description:
            error instanceof Error ? error.message : t("errors.unknownReview"),
          type: "error",
        });
      } finally {
        setIsCreatingAgentRun(false);
      }
    },
    [createAgentRun, currentRevision, currentSession, enqueueAgentChatPrompt, filePath, loadSessions, setSelectedRevisionGuid, setAgentChatOpen, setPendingAgentChatMode, t, target],
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
          title: t("finalizeRun.resultTitle", {
            time: new Date().toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
            }),
          }),
        });
        await loadSessions();
        setSelectedRevisionGuid(result.revision.guid);
        toastManager.add({
          title: t("finalizeRun.successTitle"),
          description: t("finalizeRun.successDescription"),
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title: t("finalizeRun.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("errors.unknownFinalize"),
          type: "error",
        });
      } finally {
        setIsFinalizingRun(null);
      }
    },
    [loadSessions, locale, setSelectedRevisionGuid, t],
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
          title: t("previewArtifact.errorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("errors.unknownReviewArtifact"),
          type: "error",
        });
      } finally {
        setArtifactLoading(false);
      }
    },
    [t],
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
    terminalAgentRunConfigs,
    terminalAgentRunConfig,
    autoLoadedSummaryRunRef,
    // Setters
    setSelectedSessionGuid,
    setSelectedRevisionGuid,
    setArtifactPreview,
    setTerminalAgentId,
    setTerminalAgentRunConfig,
    // Handlers
    loadSessions,
    loadComments,
    handleCreateComment,
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
