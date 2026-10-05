"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { agentChatApi } from "@/api/ws/agent-chat-api";
import { hostSessionApi } from "@/api/ws/host-session-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { ObserverHistoryRequest } from "@/features/agent/lib/observer-session-history";
import { isCancelledError } from "@/shared/lib/is-cancelled-error";

export function useObserverSessionHistory(
  request: ObserverHistoryRequest | null,
  refreshKey: string,
): { messages: AgentMessage[] | null; loading: boolean } {
  const connected = useWebSocketStore((state) => state.connectionState === "connected");
  const [messages, setMessages] = useState<AgentMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(request);
  requestRef.current = request;
  const seenKey = useRef("");

  const requestKey = request
    ? request.kind === "chat"
      ? `chat:${request.chatId}`
      : `host:${request.key}`
    : "";

  useEffect(() => {
    const current = requestRef.current;
    const switched = seenKey.current !== requestKey;
    seenKey.current = requestKey;
    if (!current || !requestKey || !connected) {
      setMessages(null);
      setLoading(false);
      return;
    }
    if (switched) setMessages(null);
    let cancelled = false;
    setLoading(true);
    const task = current.kind === "chat"
      ? agentChatApi.get(current.chatId).then((snapshot) => snapshot.messages ?? [])
      : hostSessionApi.get(current.key).then((response) => response.messages ?? []);
    void task
      .then((next) => {
        if (!cancelled) setMessages(next);
      })
      .catch((error: unknown) => {
        if (cancelled || isCancelledError(error)) return;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, refreshKey, requestKey]);

  return { messages, loading };
}
