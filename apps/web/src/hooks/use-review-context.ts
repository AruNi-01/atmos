"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toastManager } from "@workspace/ui";
import {
  reviewWsApi,
  type ReviewFileDto,
  type ReviewFixRunModel,
  type ReviewSessionDto,
  type ReviewThreadDto,
} from "@/api/ws-api";
import { buildCommand, type AgentId } from "@/components/wiki/AgentSelect";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useAgentChatUrl } from "@/hooks/use-agent-chat-url";
import { useWebSocketStore } from "@/hooks/use-websocket";
import { useReviewTerminalRunnerStore } from "@/hooks/use-review-terminal-runner";
import { sortThreads, REVIEW_AGENT_STORAGE_KEY } from "@/components/diff/review/utils";

export type RunArtifactKind = "prompt" | "patch" | "summary";

export interface ArtifactPreview {
  runGuid: string;
  kind: RunArtifactKind;
  content: string;
}

interface UseReviewContextArgs {
  workspaceId: string | null;
  filePath: string;
}

function readStoredAgentId(): AgentId {
  if (typeof window === "undefined") return "codex";
  const stored = window.localStorage.getItem(REVIEW_AGENT_STORAGE_KEY);
  return stored ? (stored as AgentId) : "codex";
}

export function useReviewContext({ workspaceId, filePath }: UseReviewContextArgs) {
  const onWsEvent = useWebSocketStore((state) => state.onEvent);
  const enqueueAgentChatPrompt = useDialogStore((state) => state.enqueueAgentChatPrompt);
  const setPendingAgentChatMode = useDialogStore(
    (state) => state.setPendingAgentChatMode,
  );
  const [, setAgentChatOpen] = useAgentChatUrl();
  const terminalRunner = useReviewTerminalRunnerStore((state) => state.runner);

  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingFixRun, setIsCreatingFixRun] = useState(false);
  const [isFinalizingRun, setIsFinalizingRun] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ReviewSessionDto[]>([]);
  const [selectedSessionGuid, setSelectedSessionGuid] = useState<string | null>(null);
  const [selectedRevisionGuid, setSelectedRevisionGuid] = useState<string | null>(null);
  const [threads, setThreads] = useState<ReviewThreadDto[]>([]);
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
      onWsEvent("review_thread_updated", () => void loadSessions()),
      onWsEvent("review_message_created", () => void loadSessions()),
      onWsEvent("review_file_updated", () => void loadSessions()),
      onWsEvent("review_fix_run_updated", () => void loadSessions()),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadSessions, onWsEvent]);

  const currentSession = useMemo(() => {
    if (sessions.length === 0) return null;
    if (selectedSessionGuid) {
      return sessions.find((session) => session.guid === selectedSessionGuid) ?? null;
    }
    return (
      sessions.find((session) => session.status === "active") ??
      [...sessions].sort((left, right) =>
        right.created_at.localeCompare(left.created_at),
      )[0]
    );
  }, [selectedSessionGuid, sessions]);

  useEffect(() => {
    if (!currentSession) {
      setSelectedSessionGuid(null);
      return;
    }
    if (selectedSessionGuid !== currentSession.guid) {
      setSelectedSessionGuid(currentSession.guid);
    }
  }, [currentSession, selectedSessionGuid]);

  const currentRevision = useMemo(() => {
    if (!currentSession) return null;
    return (
      currentSession.revisions.find(
        (revision) =>
          revision.guid === (selectedRevisionGuid ?? currentSession.current_revision_guid),
      ) ?? currentSession.revisions[0] ?? null
    );
  }, [currentSession, selectedRevisionGuid]);

  useEffect(() => {
    if (!currentSession) {
      setSelectedRevisionGuid(null);
      return;
    }
    const nextRevisionGuid =
      selectedRevisionGuid &&
      currentSession.revisions.some((revision) => revision.guid === selectedRevisionGuid)
        ? selectedRevisionGuid
        : currentSession.current_revision_guid;
    if (nextRevisionGuid !== selectedRevisionGuid) {
      setSelectedRevisionGuid(nextRevisionGuid);
    }
  }, [currentSession, selectedRevisionGuid]);

  const currentFile = useMemo<ReviewFileDto | null>(() => {
    if (!currentRevision) return null;
    return (
      currentRevision.files.find((file) => file.snapshot.file_path === filePath) ?? null
    );
  }, [currentRevision, filePath]);

  const loadThreads = useCallback(async () => {
    if (!currentSession) {
      setThreads([]);
      return;
    }
    try {
      const nextThreads = await reviewWsApi.listThreads({
        sessionGuid: currentSession.guid,
        revisionGuid: currentRevision?.guid ?? null,
      });
      setThreads(nextThreads);
    } catch (error) {
      console.error("Failed to load review threads", error);
    }
  }, [currentRevision?.guid, currentSession]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    const unsubscribers = [
      onWsEvent("review_thread_updated", () => void loadThreads()),
      onWsEvent("review_message_created", () => void loadThreads()),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadThreads, onWsEvent]);

  const canEdit =
    currentSession?.status === "active" &&
    !!currentRevision &&
    currentRevision.guid === currentSession.current_revision_guid;

  const currentFileThreads = useMemo(() => {
    if (!currentFile) return [];
    return threads.filter(
      (thread) => thread.file_snapshot_guid === currentFile.snapshot.guid,
    );
  }, [currentFile, threads]);

  const openCurrentFileThreads = useMemo(
    () =>
      currentFileThreads.filter((thread) =>
        ["open", "in_progress", "needs_user_check"].includes(thread.status),
      ),
    [currentFileThreads],
  );

  const openRevisionThreads = useMemo(
    () =>
      threads.filter((thread) =>
        ["open", "in_progress", "needs_user_check"].includes(thread.status),
      ),
    [threads],
  );

  const sortedThreads = useMemo(
    () => sortThreads(threads, currentFile?.snapshot.guid ?? null),
    [currentFile?.snapshot.guid, threads],
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
    () => currentSession?.runs.find((run) => !!run.summary_rel_path) ?? null,
    [currentSession],
  );

  const autoLoadedSummaryRunRef = useRef<string | null>(null);

  const handleCreateSession = useCallback(async () => {
    if (!workspaceId) return;
    setIsCreating(true);
    try {
      const session = await reviewWsApi.createSession({ workspaceGuid: workspaceId });
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

  const handleUpdateThreadStatus = useCallback(
    async (threadGuid: string, status: string) => {
      try {
        await reviewWsApi.updateThreadStatus(threadGuid, status);
        await loadThreads();
        await loadSessions();
      } catch (error) {
        toastManager.add({
          title: "Failed to update thread status",
          description:
            error instanceof Error ? error.message : "Unknown review thread error",
          type: "error",
        });
      }
    },
    [loadSessions, loadThreads],
  );

  const createFixRun = useCallback(
    async (
      executionMode: "copy_prompt" | "agent_chat" | "terminal_cli",
      selectedThreadGuids?: string[],
    ) => {
      if (!currentSession || !currentRevision) return null;
      return reviewWsApi.createFixRun({
        sessionGuid: currentSession.guid,
        baseRevisionGuid: currentRevision.guid,
        executionMode,
        selectedThreadGuids,
      });
    },
    [currentRevision, currentSession],
  );

  const handleCopyFixPrompt = useCallback(
    async (selectedThreadGuids?: string[]) => {
      setIsCreatingFixRun(true);
      try {
        const result = await createFixRun("copy_prompt", selectedThreadGuids);
        if (!result) return;
        await navigator.clipboard.writeText(result.prompt);
        toastManager.add({
          title: "Fix prompt copied",
          description: "Paste it into your agent CLI or chat to process the review threads.",
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
        setIsCreatingFixRun(false);
      }
    },
    [createFixRun, loadSessions],
  );

  const handleSendFixRunToAgentChat = useCallback(
    async (selectedThreadGuids?: string[]) => {
      if (!workspaceId) return;
      setIsCreatingFixRun(true);
      try {
        const result = await createFixRun("agent_chat", selectedThreadGuids);
        if (!result) return;
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
        setIsCreatingFixRun(false);
      }
    },
    [
      createFixRun,
      enqueueAgentChatPrompt,
      filePath,
      loadSessions,
      setAgentChatOpen,
      setPendingAgentChatMode,
      workspaceId,
    ],
  );

  const handleRunFixInTerminal = useCallback(
    async (selectedThreadGuids?: string[], agentIdOverride?: AgentId) => {
      setIsCreatingFixRun(true);
      try {
        const result = await createFixRun("terminal_cli", selectedThreadGuids);
        if (!result) return;
        const agentId = agentIdOverride ?? terminalAgentId;
        const command = buildCommand(agentId, result.prompt, true);
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
        setIsCreatingFixRun(false);
      }
    },
    [createFixRun, filePath, loadSessions, terminalAgentId, terminalRunner],
  );

  const handleFinalizeRun = useCallback(
    async (run: ReviewFixRunModel) => {
      setIsFinalizingRun(run.guid);
      try {
        const result = await reviewWsApi.finalizeFixRun({
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
          description: "A new review revision snapshot was created from the current workspace.",
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
    threads,
    sortedThreads,
    openCurrentFileThreads,
    openRevisionThreads,
    fileRevisionEntries,
    canEdit,
    isLoading,
    isCreating,
    isCreatingFixRun,
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
    loadThreads,
    handleCreateSession,
    handleCloseSession,
    handleArchiveSession,
    handleToggleReviewed,
    handleUpdateThreadStatus,
    createFixRun,
    handleCopyFixPrompt,
    handleSendFixRunToAgentChat,
    handleRunFixInTerminal,
    handleFinalizeRun,
    handlePreviewArtifact,
  };
}

export type ReviewContext = ReturnType<typeof useReviewContext>;
