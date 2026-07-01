"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AgentChatSessionItem } from "@/api/rest-api";
import type { AgentPlan, AgentServerMessage } from "@/features/agent/hooks/use-agent-session";
import {
  applyServerMessageToEntries,
  extractPlanMarkdown,
  isSwitchModePlanToolCall,
  type ThreadEntry,
} from "@/features/agent/lib/agent/thread";
import type { PendingPermission } from "../lib/chat-helpers";
import { DEFAULT_SESSION_TITLE } from "./use-agent-chat-session-types";

type RestoreReplayMessage = Extract<
  AgentServerMessage,
  { type: "stream" | "tool_call" | "plan_update" | "error" | "turn_end" }
>;

const RESTORE_REPLAY_BATCH_SIZE = 96;
const RESTORE_REPLAY_LARGE_BATCH_SIZE = 192;
const RESTORE_REPLAY_LARGE_QUEUE_THRESHOLD = 1000;

interface UseAgentChatMessageHandlerParams {
  entries: ThreadEntry[];
  isResumingHistory: boolean;
  pendingPermission: PendingPermission | null;
  sessionTitle: string | null;
  skipRestoreReplayRef?: MutableRefObject<boolean>;
  setCurrentPlan: Dispatch<SetStateAction<AgentPlan | null>>;
  setEntries: Dispatch<SetStateAction<ThreadEntry[]>>;
  setHistorySessions: Dispatch<SetStateAction<AgentChatSessionItem[]>>;
  setIsAutoGeneratingTitle: Dispatch<SetStateAction<boolean>>;
  setIsResumingHistory: Dispatch<SetStateAction<boolean>>;
  setPendingPermission: Dispatch<SetStateAction<PendingPermission | null>>;
  setSessionTitle: Dispatch<SetStateAction<string | null>>;
  setSessionTitleSource: Dispatch<SetStateAction<string | null>>;
  setShouldScrambleAutoTitle: Dispatch<SetStateAction<boolean>>;
  setWaitingForResponse: Dispatch<SetStateAction<boolean>>;
  stoppedRef: MutableRefObject<boolean>;
}

export function useAgentChatMessageHandler({
  entries,
  isResumingHistory,
  pendingPermission,
  sessionTitle,
  skipRestoreReplayRef,
  setCurrentPlan,
  setEntries,
  setHistorySessions,
  setIsAutoGeneratingTitle,
  setIsResumingHistory,
  setPendingPermission,
  setSessionTitle,
  setSessionTitleSource,
  setShouldScrambleAutoTitle,
  setWaitingForResponse,
  stoppedRef,
}: UseAgentChatMessageHandlerParams) {
  const pendingStreamMessagesRef = useRef<AgentServerMessage[]>([]);
  const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isResumingHistoryRef = useRef(isResumingHistory);
  const restoreReplayQueueRef = useRef<RestoreReplayMessage[]>([]);
  const restoreReplayFinishedRef = useRef(false);
  const restoreReplayFrameCancelRef = useRef<(() => void) | null>(null);

  const flushPendingStreamMessages = useCallback(() => {
    if (streamFlushTimerRef.current) {
      clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    if (pendingStreamMessagesRef.current.length === 0) return;
    const queued = pendingStreamMessagesRef.current;
    pendingStreamMessagesRef.current = [];
    setEntries((prev) => queued.reduce((acc, item) => applyServerMessageToEntries(acc, item), prev));
  }, [setEntries]);

  const scheduleStreamFlush = useCallback(() => {
    if (streamFlushTimerRef.current) return;
    streamFlushTimerRef.current = setTimeout(() => {
      flushPendingStreamMessages();
    }, 48);
  }, [flushPendingStreamMessages]);

  const cancelRestoreReplayFrame = useCallback(() => {
    restoreReplayFrameCancelRef.current?.();
    restoreReplayFrameCancelRef.current = null;
  }, []);

  const finishRestoreReplay = useCallback(() => {
    restoreReplayFinishedRef.current = false;
    stoppedRef.current = false;
    setWaitingForResponse(false);
    setIsResumingHistory(false);
    startTransition(() => {
      setEntries((prev) => {
        let changed = false;
        const next = prev.map((entry) => {
          if (entry.role === "assistant" && entry.isStreaming) {
            changed = true;
            return { ...entry, isStreaming: false };
          }
          return entry;
        });
        return changed ? next : prev;
      });
    });
  }, [setEntries, setIsResumingHistory, setWaitingForResponse, stoppedRef]);

  const flushRestoreReplayBatchRef = useRef<() => void>(() => undefined);

  const scheduleRestoreReplayFlush = useCallback(() => {
    if (restoreReplayFrameCancelRef.current) return;

    if (typeof window === "undefined") {
      const timer = setTimeout(() => {
        restoreReplayFrameCancelRef.current = null;
        flushRestoreReplayBatchRef.current();
      }, 16);
      restoreReplayFrameCancelRef.current = () => clearTimeout(timer);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      restoreReplayFrameCancelRef.current = null;
      flushRestoreReplayBatchRef.current();
    });
    restoreReplayFrameCancelRef.current = () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    flushRestoreReplayBatchRef.current = () => {
      const queue = restoreReplayQueueRef.current;
      if (queue.length === 0) {
        if (restoreReplayFinishedRef.current) {
          finishRestoreReplay();
        }
        return;
      }

      const batchSize =
        queue.length >= RESTORE_REPLAY_LARGE_QUEUE_THRESHOLD
          ? RESTORE_REPLAY_LARGE_BATCH_SIZE
          : RESTORE_REPLAY_BATCH_SIZE;
      const rawBatch = queue.splice(0, batchSize);
      const batch = coalesceRestoreReplayMessages(rawBatch);
      let latestPlan: AgentPlan | null = null;
      let settlesTurn = false;

      for (const item of batch) {
        if (item.type === "plan_update") {
          latestPlan = item.plan;
        } else if (
          item.type === "error" ||
          item.type === "turn_end" ||
          (item.type === "stream" && item.done)
        ) {
          settlesTurn = true;
        }
      }

      startTransition(() => {
        setEntries((prev) =>
          batch.reduce((acc, item) => applyServerMessageToEntries(acc, item), prev),
        );
        if (latestPlan) {
          setCurrentPlan(latestPlan);
        }
      });
      if (settlesTurn) {
        stoppedRef.current = false;
        setWaitingForResponse(false);
      }

      if (queue.length > 0) {
        scheduleRestoreReplayFlush();
      } else if (restoreReplayFinishedRef.current) {
        scheduleRestoreReplayFlush();
      }
    };
  }, [
    finishRestoreReplay,
    scheduleRestoreReplayFlush,
    setCurrentPlan,
    setEntries,
    setWaitingForResponse,
    stoppedRef,
  ]);

  useEffect(() => {
    isResumingHistoryRef.current = isResumingHistory;
    if (!isResumingHistory) {
      restoreReplayQueueRef.current = [];
      restoreReplayFinishedRef.current = false;
      cancelRestoreReplayFrame();
    }
  }, [cancelRestoreReplayFrame, isResumingHistory]);

  useEffect(() => {
    return () => {
      if (streamFlushTimerRef.current) {
        clearTimeout(streamFlushTimerRef.current);
      }
      cancelRestoreReplayFrame();
    };
  }, [cancelRestoreReplayFrame]);

  const handleMessage = useCallback((msg: AgentServerMessage) => {
    if (
      isResumingHistoryRef.current &&
      skipRestoreReplayRef?.current &&
      isRestoreReplayContentMessage(msg)
    ) {
      return;
    }

    if (isResumingHistoryRef.current && isRestoreReplayMessage(msg)) {
      if (stoppedRef.current) return;
      restoreReplayQueueRef.current.push(msg);
      if (msg.type === "error") {
        restoreReplayFinishedRef.current = true;
      }
      scheduleRestoreReplayFlush();
      return;
    }

    switch (msg.type) {
      case "stream":
        if (stoppedRef.current) return;
        if (msg.done) {
          stoppedRef.current = false;
          setWaitingForResponse(false);
        }
        pendingStreamMessagesRef.current.push(msg);
        if (msg.done) {
          flushPendingStreamMessages();
        } else {
          scheduleStreamFlush();
        }
        break;
      case "tool_call":
        if (stoppedRef.current) return;
        flushPendingStreamMessages();
        setEntries((prev) => applyServerMessageToEntries(prev, msg));
        break;
      case "plan_update":
        if (stoppedRef.current) return;
        flushPendingStreamMessages();
        setCurrentPlan(msg.plan);
        setEntries((prev) => applyServerMessageToEntries(prev, msg));
        break;
      case "permission_request":
        flushPendingStreamMessages();
        setPendingPermission({
          request_id: msg.request_id,
          tool: msg.tool,
          description: msg.description,
          content_markdown: msg.content_markdown,
          risk_level: msg.risk_level,
          options: msg.options ?? [],
        });
        break;
      case "error":
        flushPendingStreamMessages();
        stoppedRef.current = false;
        setWaitingForResponse(false);
        setEntries((prev) => applyServerMessageToEntries(prev, msg));
        break;
      case "turn_end":
        flushPendingStreamMessages();
        stoppedRef.current = false;
        setWaitingForResponse(false);
        setEntries((prev) => applyServerMessageToEntries(prev, msg));
        break;
      case "usage_update":
        flushPendingStreamMessages();
        setEntries((prev) => {
          let changed = false;
          const next = prev.map((entry) => {
            if (entry.role !== "assistant" || !entry.isStreaming) return entry;
            const hasRunningTool = entry.blocks.some(
              (block) => block.type === "tool_call" && block.status === "running",
            );
            if (hasRunningTool) return entry;
            changed = true;
            return { ...entry, isStreaming: false };
          });
          if (changed) {
            stoppedRef.current = false;
            setWaitingForResponse(false);
          }
          return changed ? next : prev;
        });
        break;
      case "session_info_update":
        if ("title" in msg) {
          const nextTitle = msg.title ?? null;
          setSessionTitle(nextTitle);
          setSessionTitleSource("agent");
          if (!nextTitle || nextTitle === DEFAULT_SESSION_TITLE) {
            setShouldScrambleAutoTitle(false);
          } else if (nextTitle !== sessionTitle) {
            setShouldScrambleAutoTitle(true);
          }
        }
        setHistorySessions((prev) =>
          prev.map((session) => {
            if (session.acp_session_id !== msg.acp_session_id) return session;
            return {
              ...session,
              ...("title" in msg ? { title: msg.title ?? null } : {}),
              ...("updated_at" in msg ? { updated_at: msg.updated_at ?? null } : {}),
            };
          }),
        );
        setIsAutoGeneratingTitle(false);
        break;
      case "session_ready":
        if (skipRestoreReplayRef?.current) {
          skipRestoreReplayRef.current = false;
          restoreReplayQueueRef.current = [];
          restoreReplayFinishedRef.current = false;
          cancelRestoreReplayFrame();
          stoppedRef.current = false;
          setWaitingForResponse(false);
          setIsResumingHistory(false);
          break;
        }
        if (isResumingHistoryRef.current || restoreReplayQueueRef.current.length > 0) {
          restoreReplayFinishedRef.current = true;
          scheduleRestoreReplayFlush();
          break;
        }
        setIsResumingHistory(false);
        break;
      case "agent_info_update":
      case "capabilities_update":
        break;
      case "session_closed":
        if (skipRestoreReplayRef) {
          skipRestoreReplayRef.current = false;
        }
        restoreReplayQueueRef.current = [];
        restoreReplayFinishedRef.current = false;
        cancelRestoreReplayFrame();
        flushPendingStreamMessages();
        stoppedRef.current = false;
        setWaitingForResponse(false);
        setIsResumingHistory(false);
        setPendingPermission(null);
        setEntries((prev) =>
          prev.map((entry) =>
            entry.role === "assistant" && entry.isStreaming
              ? { ...entry, isStreaming: false }
              : entry,
          ),
        );
        break;
      case "session_ended":
        flushPendingStreamMessages();
        stoppedRef.current = false;
        setWaitingForResponse(false);
        break;
      case "load_completed":
        if (skipRestoreReplayRef?.current) {
          skipRestoreReplayRef.current = false;
          restoreReplayQueueRef.current = [];
          restoreReplayFinishedRef.current = false;
          cancelRestoreReplayFrame();
          stoppedRef.current = false;
          setWaitingForResponse(false);
          setIsResumingHistory(false);
          break;
        }
        if (isResumingHistoryRef.current || restoreReplayQueueRef.current.length > 0) {
          restoreReplayFinishedRef.current = true;
          scheduleRestoreReplayFlush();
        }
        break;
    }
  }, [
    cancelRestoreReplayFrame,
    flushPendingStreamMessages,
    scheduleRestoreReplayFlush,
    scheduleStreamFlush,
    sessionTitle,
    skipRestoreReplayRef,
    setCurrentPlan,
    setEntries,
    setHistorySessions,
    setIsAutoGeneratingTitle,
    setIsResumingHistory,
    setPendingPermission,
    setSessionTitle,
    setSessionTitleSource,
    setShouldScrambleAutoTitle,
    setWaitingForResponse,
    stoppedRef,
  ]);

  const pendingPermissionMarkdown = useMemo(() => {
    if (!pendingPermission) return null;
    if (pendingPermission.content_markdown?.trim()) {
      return pendingPermission.content_markdown;
    }

    for (let entryIdx = entries.length - 1; entryIdx >= 0; entryIdx--) {
      const entry = entries[entryIdx];
      if (entry.role !== "assistant") continue;
      for (let blockIdx = entry.blocks.length - 1; blockIdx >= 0; blockIdx--) {
        const block = entry.blocks[blockIdx];
        if (block.type !== "tool_call") continue;
        if (!isSwitchModePlanToolCall(block)) continue;
        const markdown = extractPlanMarkdown(block.raw_input);
        if (markdown) return markdown;
      }
    }

    return null;
  }, [entries, pendingPermission]);

  return {
    handleMessage,
    pendingPermissionMarkdown,
  };
}

function isRestoreReplayMessage(msg: AgentServerMessage): msg is RestoreReplayMessage {
  return (
    msg.type === "stream" ||
    msg.type === "tool_call" ||
    msg.type === "plan_update" ||
    msg.type === "error" ||
    msg.type === "turn_end"
  );
}

function isRestoreReplayContentMessage(msg: AgentServerMessage): msg is RestoreReplayMessage {
  return (
    msg.type === "stream" ||
    msg.type === "tool_call" ||
    msg.type === "plan_update" ||
    msg.type === "turn_end"
  );
}

function coalesceRestoreReplayMessages(
  messages: RestoreReplayMessage[],
): RestoreReplayMessage[] {
  const coalesced: RestoreReplayMessage[] = [];

  for (const message of messages) {
    const last = coalesced[coalesced.length - 1];
    if (
      message.type === "stream" &&
      last?.type === "stream" &&
      !last.done &&
      last.role === message.role &&
      last.kind === message.kind
    ) {
      coalesced[coalesced.length - 1] = {
        ...last,
        delta: `${last.delta}${message.delta}`,
        done: message.done,
        usage: message.usage ?? last.usage,
      };
      continue;
    }

    coalesced.push(message);
  }

  return coalesced;
}
