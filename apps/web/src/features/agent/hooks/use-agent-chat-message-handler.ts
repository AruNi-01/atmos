"use client";

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AgentChatSessionItem } from "@/api/rest-api";
import type { AgentPlan, AgentServerMessage } from "@/features/agent/hooks/use-agent-session";
import {
  applyServerMessageToEntries,
  extractPlanMarkdown,
  isSwitchModePlanToolCall,
  type ThreadEntry,
} from "@/features/agent/lib/agent/thread";
import type { PendingPermission } from "../lib/chat-helpers";

interface UseAgentChatMessageHandlerParams {
  entries: ThreadEntry[];
  pendingPermission: PendingPermission | null;
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
  pendingPermission,
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

  useEffect(() => {
    return () => {
      if (streamFlushTimerRef.current) {
        clearTimeout(streamFlushTimerRef.current);
      }
    };
  }, []);

  const handleMessage = useCallback((msg: AgentServerMessage) => {
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
          setSessionTitle(msg.title ?? null);
          setSessionTitleSource("agent");
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
        setShouldScrambleAutoTitle(false);
        break;
      case "session_ready":
        setIsResumingHistory(false);
        break;
      case "agent_info_update":
      case "capabilities_update":
        break;
      case "session_closed":
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
        flushPendingStreamMessages();
        stoppedRef.current = false;
        setWaitingForResponse(false);
        setIsResumingHistory(false);
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
        break;
    }
  }, [
    flushPendingStreamMessages,
    scheduleStreamFlush,
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
