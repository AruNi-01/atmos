"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi, getAgentWsBase } from "@/api/rest-api";

export type AgentServerMessage =
  | { type: "stream"; delta: string; done: boolean; usage?: unknown }
  | {
      type: "tool_call";
      tool_call_id: string;
      tool: string;
      description: string;
      status: "running" | "completed" | "failed";
      raw_input?: unknown;
      raw_output?: unknown;
      detail?: unknown;
    }
  | {
      type: "permission_request";
      request_id: string;
      tool: string;
      description: string;
      risk_level: string;
    }
  | { type: "error"; code: string; message: string; recoverable: boolean }
  | { type: "session_ended" };

export interface UseAgentSessionOptions {
  workspaceId: string | null;
  registryId: string;
  onMessage?: (msg: AgentServerMessage) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (err: string) => void;
}

export interface UseAgentSessionReturn {
  sessionId: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  sendPrompt: (message: string) => void;
  sendPermissionResponse: (
    requestId: string,
    allowed: boolean,
    rememberForSession?: boolean
  ) => void;
  startSession: () => Promise<void>;
  disconnect: () => void;
}

export function useAgentSession({
  workspaceId,
  registryId,
  onMessage,
  onConnected,
  onDisconnected,
  onError,
}: UseAgentSessionOptions): UseAgentSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const sendPrompt = useCallback(
    (message: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "prompt", message })
        );
      }
    },
    []
  );

  const sendPermissionResponse = useCallback(
    (
      requestId: string,
      allowed: boolean,
      rememberForSession = false
    ) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "permission_response",
            request_id: requestId,
            allowed,
            remember_for_session: rememberForSession,
          })
        );
      }
    },
    []
  );

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setSessionId(null);
    setIsConnected(false);
    setError(null);
  }, []);

  const startSession = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const res = await agentApi.createSession(workspaceId ?? null, registryId);
      const sid = res.session_id;
      setSessionId(sid);

      const wsBase = getAgentWsBase();
      const wsUrl = `${wsBase}/ws/agent/${sid}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnecting(false);
        setIsConnected(true);
        setError(null);
        onConnected?.();
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as AgentServerMessage;
          onMessageRef.current?.(msg);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setIsConnecting(false);
        setIsConnected(false);
        onDisconnected?.();
      };

      ws.onerror = () => {
        setError("WebSocket error");
        onError?.("WebSocket error");
      };
    } catch (err) {
      setIsConnecting(false);
      const msg = err instanceof Error ? err.message : "Failed to create session";
      setError(msg);
      onError?.(msg);
    }
  }, [workspaceId, registryId, onConnected, onDisconnected, onError]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    sessionId,
    isConnecting,
    isConnected,
    error,
    sendPrompt,
    sendPermissionResponse,
    startSession,
    disconnect,
  };
}
