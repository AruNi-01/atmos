"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parsePatchFiles } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import { useTheme } from "next-themes";
import {
  Button,
  Checkbox,
  Loader2,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toastManager,
} from "@workspace/ui";
import {
  Copy,
  FileCode2,
  History,
  MessageSquarePlus,
  PlayCircle,
  Terminal,
  WandSparkles,
} from "lucide-react";
import {
  reviewWsApi,
  type ReviewFileDto,
  type ReviewFixRunModel,
  type ReviewSessionDto,
  type ReviewThreadDto,
} from "@/api/ws-api";
import { AgentSelect, buildCommand, type AgentId } from "@/components/wiki/AgentSelect";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useAgentChatUrl } from "@/hooks/use-agent-chat-url";
import { useWebSocketStore } from "@/hooks/use-websocket";
import type { SelectionInfo } from "@/lib/format-selection-for-ai";
import { cn } from "@/lib/utils";

interface ReviewSessionPanelProps {
  workspaceId: string | null;
  filePath: string;
  selectionInfo: SelectionInfo | null;
  onSelectionConsumed: () => void;
  selectedSnapshotGuid: string | null;
  onSelectSnapshotView: (snapshotGuid: string, label: string) => void;
  onSelectLiveView: () => void;
  onRunInTerminal?: (command: string, label: string) => Promise<void> | void;
}

type PanelTab = "threads" | "files" | "runs" | "summary";
type RunArtifactKind = "prompt" | "patch" | "summary";

const REVIEW_AGENT_STORAGE_KEY = "atmos.review.default_agent_id";

function readStoredAgentId(): AgentId {
  if (typeof window === "undefined") return "claude";
  const stored = window.localStorage.getItem(REVIEW_AGENT_STORAGE_KEY);
  return stored ? (stored as AgentId) : "claude";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusTone(status: string) {
  switch (status) {
    case "fixed":
    case "closed":
      return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
    case "needs_user_check":
      return "text-amber-600 bg-amber-500/10 border-amber-500/20";
    case "dismissed":
    case "archived":
      return "text-muted-foreground bg-muted border-border";
    case "in_progress":
    case "running":
    case "finalizing":
      return "text-sky-600 bg-sky-500/10 border-sky-500/20";
    default:
      return "text-foreground bg-muted/50 border-border";
  }
}

function isPatchRenderable(patch: string) {
  try {
    return parsePatchFiles(patch).length > 0;
  } catch {
    return false;
  }
}

function threadTitle(thread: ReviewThreadDto) {
  if (thread.title?.trim()) return thread.title.trim();
  if (thread.anchor_start_line === thread.anchor_end_line) {
    return `Comment on L${thread.anchor_start_line}`;
  }
  return `Comment on L${thread.anchor_start_line}-${thread.anchor_end_line}`;
}

function sortThreads(threads: ReviewThreadDto[], currentFileSnapshotGuid: string | null) {
  const statusRank = (status: string) => {
    switch (status) {
      case "open":
        return 0;
      case "needs_user_check":
        return 1;
      case "in_progress":
        return 2;
      case "fixed":
        return 3;
      case "dismissed":
        return 4;
      default:
        return 5;
    }
  };

  return [...threads].sort((left, right) => {
    const leftCurrent = left.file_snapshot_guid === currentFileSnapshotGuid ? 0 : 1;
    const rightCurrent = right.file_snapshot_guid === currentFileSnapshotGuid ? 0 : 1;
    if (leftCurrent !== rightCurrent) return leftCurrent - rightCurrent;
    const leftStatus = statusRank(left.status);
    const rightStatus = statusRank(right.status);
    if (leftStatus !== rightStatus) return leftStatus - rightStatus;
    return right.created_at.localeCompare(left.created_at);
  });
}

export function ReviewSessionPanel({
  workspaceId,
  filePath,
  selectionInfo,
  onSelectionConsumed,
  selectedSnapshotGuid,
  onSelectSnapshotView,
  onSelectLiveView,
  onRunInTerminal,
}: ReviewSessionPanelProps) {
  const { resolvedTheme } = useTheme();
  const onWsEvent = useWebSocketStore((state) => state.onEvent);
  const enqueueAgentChatPrompt = useDialogStore((state) => state.enqueueAgentChatPrompt);
  const setPendingAgentChatMode = useDialogStore(
    (state) => state.setPendingAgentChatMode,
  );
  const [, setAgentChatOpen] = useAgentChatUrl();
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isCreatingFixRun, setIsCreatingFixRun] = useState(false);
  const [isFinalizingRun, setIsFinalizingRun] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [sessions, setSessions] = useState<ReviewSessionDto[]>([]);
  const [selectedSessionGuid, setSelectedSessionGuid] = useState<string | null>(null);
  const [selectedRevisionGuid, setSelectedRevisionGuid] = useState<string | null>(null);
  const [threads, setThreads] = useState<ReviewThreadDto[]>([]);
  const [panelTab, setPanelTab] = useState<PanelTab>("threads");
  const [terminalAgentId, setTerminalAgentId] = useState<AgentId>(readStoredAgentId);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactPreview, setArtifactPreview] = useState<{
    runGuid: string;
    kind: RunArtifactKind;
    content: string;
  } | null>(null);

  const patchOptions = useMemo(
    () => ({
      theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
      diffStyle: "unified" as const,
      overflow: "wrap" as const,
      disableLineNumbers: false,
      disableFileHeader: false,
    }),
    [resolvedTheme],
  );

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
  useEffect(() => {
    if (!latestSummaryRun || panelTab !== "summary") return;
    // Only auto-load the latest-run summary once per distinct latestSummaryRun.
    // Depending on `artifactPreview` would cause this effect to re-fire and overwrite
    // the user's explicit selection (e.g. clicking "Summary" on an older run).
    if (autoLoadedSummaryRunRef.current === latestSummaryRun.guid) {
      return;
    }
    autoLoadedSummaryRunRef.current = latestSummaryRun.guid;
    void (async () => {
      setArtifactLoading(true);
      try {
        const artifact = await reviewWsApi.getRunArtifact({
          runGuid: latestSummaryRun.guid,
          kind: "summary",
        });
        setArtifactPreview({
          runGuid: latestSummaryRun.guid,
          kind: "summary",
          content: artifact.content,
        });
      } catch {
        // Ignore empty summary preview loads.
      } finally {
        setArtifactLoading(false);
      }
    })();
  }, [latestSummaryRun, panelTab]);

  const handleCreateSession = useCallback(async () => {
    if (!workspaceId) return;
    setIsCreating(true);
    try {
      const session = await reviewWsApi.createSession({ workspaceGuid: workspaceId });
      setSelectedSessionGuid(session.guid);
      setSelectedRevisionGuid(session.current_revision_guid);
      await loadSessions();
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
  }, [loadSessions, workspaceId]);

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

  const handleCreateComment = useCallback(async () => {
    if (!currentSession || !currentRevision || !currentFile || !selectionInfo) return;
    const body = commentBody.trim();
    if (!body) {
      toastManager.add({
        title: "Comment is empty",
        description: "Write a short review note before creating a thread.",
        type: "error",
      });
      return;
    }

    const anchor = {
      file_path: filePath,
      side:
        selectionInfo.diffSide ??
        (selectionInfo.changeType === "deletion" ? "old" : "new"),
      start_line: selectionInfo.startLine,
      end_line: selectionInfo.endLine,
      line_range_kind:
        selectionInfo.startLine === selectionInfo.endLine ? "single" : "range",
      selected_text: selectionInfo.selectedText,
      before_context: selectionInfo.beforeText
        ? selectionInfo.beforeText.split("\n")
        : [],
      after_context: selectionInfo.afterText ? selectionInfo.afterText.split("\n") : [],
      hunk_header: null,
    };

    setIsSubmittingComment(true);
    try {
      await reviewWsApi.createThread({
        sessionGuid: currentSession.guid,
        revisionGuid: currentRevision.guid,
        fileSnapshotGuid: currentFile.snapshot.guid,
        anchor,
        body,
      });
      setCommentBody("");
      onSelectionConsumed();
      setPanelTab("threads");
      await loadThreads();
      await loadSessions();
    } catch (error) {
      toastManager.add({
        title: "Failed to create review comment",
        description:
          error instanceof Error ? error.message : "Unknown review comment error",
        type: "error",
      });
    } finally {
      setIsSubmittingComment(false);
    }
  }, [
    commentBody,
    currentFile,
    currentRevision,
    currentSession,
    filePath,
    loadSessions,
    loadThreads,
    onSelectionConsumed,
    selectionInfo,
  ]);

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
    async (selectedThreadGuids?: string[]) => {
      setIsCreatingFixRun(true);
      try {
        const result = await createFixRun("terminal_cli", selectedThreadGuids);
        if (!result) return;
        const command = buildCommand(terminalAgentId, result.prompt, true);
        const label = `Review Fix ${filePath.split("/").pop() || "Run"}`;
        if (onRunInTerminal) {
          await onRunInTerminal(command, label);
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
    [createFixRun, filePath, loadSessions, onRunInTerminal, terminalAgentId],
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
        setPanelTab("runs");
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

  const handlePreviewArtifact = useCallback(async (runGuid: string, kind: RunArtifactKind) => {
    setArtifactLoading(true);
    try {
      const artifact = await reviewWsApi.getRunArtifact({ runGuid, kind });
      setArtifactPreview({
        runGuid,
        kind,
        content: artifact.content,
      });
      setPanelTab(kind === "summary" ? "summary" : "runs");
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
  }, []);

  if (!workspaceId) return null;

  return (
    <div className="w-full border-l border-border bg-muted/20 xl:w-[420px]">
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Review Session</p>
              <p className="text-xs text-muted-foreground">
                Session-scoped comments, file review state, and AI fix runs.
              </p>
            </div>
            {isLoading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          {sessions.length > 0 ? (
            <div className="mt-3">
              <Select
                value={currentSession?.guid ?? undefined}
                onValueChange={(value) => {
                  setSelectedSessionGuid(value);
                  setSelectedRevisionGuid(null);
                  setArtifactPreview(null);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select review session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((session) => (
                    <SelectItem key={session.guid} value={session.guid}>
                      {(session.title?.trim() || "Review Session") +
                        ` · ${session.status.replaceAll("_", " ")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {!currentSession ? (
            <div className="mt-3 rounded-lg border border-dashed border-border bg-background/70 p-3">
              <p className="text-sm text-foreground">
                No review session for this workspace yet.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start one to persist comments against a stable review snapshot.
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
          ) : (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-border bg-background/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {currentSession.title?.trim() || "Current Review Session"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Started {formatDate(currentSession.created_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
                      statusTone(currentSession.status),
                    )}
                  >
                    {currentSession.status.replaceAll("_", " ")}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span>{currentSession.open_thread_count} open threads</span>
                  <span>{currentSession.reviewed_file_count} reviewed files</span>
                  {currentSession.reviewed_then_changed_count > 0 ? (
                    <span>
                      {currentSession.reviewed_then_changed_count} changed after review
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCreateSession}
                    disabled={isCreating}
                  >
                    New Session
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await reviewWsApi.closeSession(currentSession.guid);
                      await loadSessions();
                    }}
                    disabled={currentSession.status !== "active"}
                  >
                    Close
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await reviewWsApi.archiveSession(currentSession.guid);
                      await loadSessions();
                    }}
                  >
                    Archive
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background/80 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Revision Timeline</p>
                    <p className="text-xs text-muted-foreground">
                      Switch between live workspace diff and saved review snapshots.
                    </p>
                  </div>
                  <History className="size-4 text-muted-foreground" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={selectedSnapshotGuid ? "outline" : "default"}
                    onClick={onSelectLiveView}
                  >
                    Live Diff
                  </Button>
                  {fileRevisionEntries.map(({ revision, file }) => (
                    <Button
                      key={revision.guid}
                      size="sm"
                      variant={
                        selectedSnapshotGuid === file.snapshot.guid ? "default" : "outline"
                      }
                      onClick={() => {
                        setSelectedRevisionGuid(revision.guid);
                        onSelectSnapshotView(
                          file.snapshot.guid,
                          revision.title?.trim() || revision.guid.slice(0, 8),
                        );
                      }}
                    >
                      {revision.title?.trim() || revision.guid.slice(0, 8)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {filePath}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {currentRevision
                        ? `Revision ${currentRevision.title || currentRevision.guid.slice(0, 8)}${canEdit ? "" : " (read-only)"}`
                        : "No active revision"}
                    </p>
                  </div>
                  {currentFile ? (
                    <label className="flex items-center gap-2 text-xs text-foreground">
                      <Checkbox
                        checked={currentFile.state.reviewed}
                        disabled={!canEdit}
                        onCheckedChange={(value) =>
                          handleToggleReviewed(currentFile, Boolean(value))
                        }
                      />
                      Reviewed
                    </label>
                  ) : null}
                </div>

                {currentFile ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>{currentFile.open_thread_count} open file threads</span>
                    {currentFile.changed_after_review ? (
                      <span className="text-amber-600">Reviewed, changed after review</span>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    This file is not part of the selected review revision.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-border bg-background/80 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Fix Execution</p>
                    <p className="text-xs text-muted-foreground">
                      Create a run for current-file comments or all open threads in this revision.
                    </p>
                  </div>
                  <WandSparkles className="size-4 text-muted-foreground" />
                </div>

                <AgentSelect
                  value={terminalAgentId}
                  onValueChange={(value) => {
                    setTerminalAgentId(value);
                    if (typeof window !== "undefined") {
                      window.localStorage.setItem(REVIEW_AGENT_STORAGE_KEY, value);
                    }
                  }}
                  className="mb-3"
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !canEdit ||
                      !currentFile ||
                      openCurrentFileThreads.length === 0 ||
                      isCreatingFixRun
                    }
                    onClick={() =>
                      handleCopyFixPrompt(openCurrentFileThreads.map((thread) => thread.guid))
                    }
                  >
                    {isCreatingFixRun ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Copy className="mr-2 size-4" />
                    )}
                    Copy File Prompt
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canEdit || openRevisionThreads.length === 0 || isCreatingFixRun}
                    onClick={() => handleCopyFixPrompt()}
                  >
                    Copy Revision Prompt
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canEdit || openRevisionThreads.length === 0 || isCreatingFixRun}
                    onClick={() => handleSendFixRunToAgentChat()}
                  >
                    Send To Agent
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canEdit || openRevisionThreads.length === 0 || isCreatingFixRun}
                    onClick={() => handleRunFixInTerminal()}
                  >
                    <Terminal className="mr-2 size-4" />
                    Run In Terminal
                  </Button>
                </div>
              </div>

              {selectionInfo && currentFile ? (
                <div className="rounded-lg border border-border bg-background/80 p-3">
                  <p className="text-sm font-medium text-foreground">New Comment</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectionInfo.startLine === selectionInfo.endLine
                      ? `Line ${selectionInfo.startLine}`
                      : `Lines ${selectionInfo.startLine}-${selectionInfo.endLine}`}
                  </p>
                  <Textarea
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="Describe the issue or expected change..."
                    className="mt-3 min-h-24"
                    disabled={!canEdit}
                  />
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCreateComment}
                      disabled={!canEdit || isSubmittingComment}
                    >
                      {isSubmittingComment ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : null}
                      Add Comment
                    </Button>
                    <Button size="sm" variant="outline" onClick={onSelectionConsumed}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
          {currentSession ? (
            <Tabs
              value={panelTab}
              onValueChange={(value) => setPanelTab(value as PanelTab)}
              className="h-full min-h-0"
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="threads">Threads</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="runs">Runs</TabsTrigger>
                <TabsTrigger value="summary">Summary</TabsTrigger>
              </TabsList>

              <TabsContent value="threads" className="mt-3 min-h-0 overflow-y-auto">
                {sortedThreads.length > 0 ? (
                  <div className="space-y-3">
                    {sortedThreads.map((thread) => {
                      const threadCanEdit =
                        canEdit && thread.revision_guid === currentSession.current_revision_guid;
                      return (
                        <div
                          key={thread.guid}
                          className="rounded-lg border border-border bg-background/80 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {threadTitle(thread)}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {thread.anchor.file_path || filePath} · {formatDate(thread.created_at)}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
                                statusTone(thread.status),
                              )}
                            >
                              {thread.status.replaceAll("_", " ")}
                            </span>
                          </div>

                          <div className="mt-3 space-y-2">
                            {thread.messages.map((message) => (
                              <div
                                key={message.guid}
                                className={cn(
                                  "rounded-md border px-3 py-2 text-sm",
                                  message.author_type === "user"
                                    ? "border-border bg-muted/50"
                                    : "border-sky-500/20 bg-sky-500/5",
                                )}
                              >
                                <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                                  <span>{message.author_type}</span>
                                  <span>{formatDate(message.created_at)}</span>
                                </div>
                                <p className="whitespace-pre-wrap break-words text-foreground">
                                  {message.body_full}
                                </p>
                              </div>
                            ))}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!threadCanEdit}
                              onClick={() =>
                                handleUpdateThreadStatus(thread.guid, "needs_user_check")
                              }
                            >
                              Needs Check
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!threadCanEdit}
                              onClick={() => handleUpdateThreadStatus(thread.guid, "fixed")}
                            >
                              Mark Fixed
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!threadCanEdit}
                              onClick={() => handleUpdateThreadStatus(thread.guid, "dismissed")}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No review threads in this revision yet.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="files" className="mt-3 min-h-0 overflow-y-auto">
                {currentRevision ? (
                  <div className="space-y-2">
                    {currentRevision.files.map((file) => (
                      <div
                        key={file.snapshot.guid}
                        className={cn(
                          "rounded-lg border bg-background/80 p-3",
                          file.snapshot.file_path === filePath
                            ? "border-primary/30"
                            : "border-border",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {file.snapshot.file_path}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                              <span>{file.snapshot.git_status}</span>
                              <span>{file.open_thread_count} open threads</span>
                              {file.changed_after_review ? (
                                <span className="text-amber-600">
                                  Reviewed, changed after review
                                </span>
                              ) : null}
                              {file.snapshot.file_path === filePath ? (
                                <span className="text-primary">Current file</span>
                              ) : null}
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-foreground">
                            <Checkbox
                              checked={file.state.reviewed}
                              disabled={!canEdit}
                              onCheckedChange={(value) =>
                                handleToggleReviewed(file, Boolean(value))
                              }
                            />
                            Reviewed
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No revision selected.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="runs" className="mt-3 min-h-0 overflow-y-auto">
                <div className="space-y-3">
                  {currentSession.runs.length > 0 ? (
                    currentSession.runs.map((run) => {
                      const resultRevision = currentSession.revisions.find(
                        (revision) => revision.guid === run.result_revision_guid,
                      );
                      const resultFile = resultRevision?.files.find(
                        (file) => file.snapshot.file_path === filePath,
                      );
                      const isActivePreview = artifactPreview?.runGuid === run.guid;

                      return (
                        <div
                          key={run.guid}
                          className="rounded-lg border border-border bg-background/80 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {run.execution_mode.replaceAll("_", " ")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(run.created_at)}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
                                statusTone(run.status),
                              )}
                            >
                              {run.status.replaceAll("_", " ")}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {resultFile ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedRevisionGuid(resultRevision?.guid ?? null);
                                  onSelectSnapshotView(
                                    resultFile.snapshot.guid,
                                    resultRevision?.title?.trim() ||
                                      resultRevision?.guid.slice(0, 8) ||
                                      "Fix Result",
                                  );
                                }}
                              >
                                View Result Snapshot
                              </Button>
                            ) : null}
                            {run.patch_rel_path ? (
                              <Button
                                size="sm"
                                variant={isActivePreview && artifactPreview?.kind === "patch" ? "default" : "outline"}
                                onClick={() => handlePreviewArtifact(run.guid, "patch")}
                              >
                                View Fix Diff
                              </Button>
                            ) : null}
                            {run.prompt_rel_path ? (
                              <Button
                                size="sm"
                                variant={isActivePreview && artifactPreview?.kind === "prompt" ? "default" : "outline"}
                                onClick={() => handlePreviewArtifact(run.guid, "prompt")}
                              >
                                Prompt
                              </Button>
                            ) : null}
                            {run.summary_rel_path ? (
                              <Button
                                size="sm"
                                variant={isActivePreview && artifactPreview?.kind === "summary" ? "default" : "outline"}
                                onClick={() => handlePreviewArtifact(run.guid, "summary")}
                              >
                                Summary
                              </Button>
                            ) : null}
                            {!run.result_revision_guid ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isFinalizingRun === run.guid}
                                onClick={() => handleFinalizeRun(run)}
                              >
                                {isFinalizingRun === run.guid ? (
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : null}
                                Finalize Run
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No fix runs yet for this session.
                    </p>
                  )}

                  {artifactPreview && panelTab === "runs" ? (
                    <div className="rounded-lg border border-border bg-background/80 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {artifactPreview.kind === "patch"
                              ? "Fix Diff"
                              : artifactPreview.kind === "prompt"
                                ? "Run Prompt"
                                : "Run Summary"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {artifactPreview.runGuid.slice(0, 8)}
                          </p>
                        </div>
                        {artifactLoading ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>

                      {artifactPreview.kind === "patch" &&
                      isPatchRenderable(artifactPreview.content) ? (
                        <div className="max-h-[420px] overflow-auto rounded-md border border-border/70">
                          <PatchDiff patch={artifactPreview.content} options={patchOptions} />
                        </div>
                      ) : (
                        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-border/70 bg-muted/40 p-3 text-xs text-foreground">
                          {artifactPreview.content}
                        </pre>
                      )}
                    </div>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="summary" className="mt-3 min-h-0 overflow-y-auto">
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-background/80 p-3">
                    <p className="text-sm font-medium text-foreground">Current Revision Overview</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide">Files</div>
                        <div className="mt-1 text-sm font-medium text-foreground">
                          {currentRevision?.files.length ?? 0}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide">Open Threads</div>
                        <div className="mt-1 text-sm font-medium text-foreground">
                          {openRevisionThreads.length}
                        </div>
                      </div>
                    </div>
                  </div>

                  {latestSummaryRun ? (
                    <div className="rounded-lg border border-border bg-background/80 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Latest Run Summary</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(latestSummaryRun.finished_at || latestSummaryRun.updated_at)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePreviewArtifact(latestSummaryRun.guid, "summary")}
                        >
                          <FileCode2 className="mr-2 size-4" />
                          Reload
                        </Button>
                      </div>
                      {artifactLoading && artifactPreview?.kind !== "summary" ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : artifactPreview?.kind === "summary" ? (
                        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-border/70 bg-muted/40 p-3 text-xs text-foreground">
                          {artifactPreview.content}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No summary preview loaded yet.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No run summary available yet. Once the agent writes a summary, it will appear here.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <p className="text-sm text-muted-foreground">
              Create a session to start reviewing this file.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
