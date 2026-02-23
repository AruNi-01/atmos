"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi, getAgentWsBase, type AgentAuthMethod, type AgentAuthRequiredPayload } from "@/api/rest-api";

const AUTH_REQUIRED_ERROR_PREFIX = "ACP_AUTH_REQUIRED::";

export type AgentConnectionPhase =
  | "idle"
  | "initializing"
  | "authenticating"
  | "resuming_session"
  | "creating_session"
  | "connecting_ws"
  | "connected";

export interface AcpPermissionOption {
  option_id: string;
  name: string;
  /** "allow_once" | "allow_always" | "reject_once" | "reject_always" | "other" */
  kind: string;
}

export type AgentServerMessage =
  | {
      type: "stream";
      role?: "assistant" | "user";
      kind?: "message" | "thinking";
      delta: string;
      done: boolean;
      usage?: unknown;
    }
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
      options: AcpPermissionOption[];
    }
  | { type: "error"; code: string; message: string; recoverable: boolean }
  | { type: "turn_end" }
  | { type: "session_ended" }
  | { type: "phase_update"; phase: string };

export interface UseAgentSessionOptions {
  workspaceId: string | null;
  projectId: string | null;
  registryId: string;
  onMessage?: (msg: AgentServerMessage) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (err: string) => void;
}

/** Override context when starting from history selection */
export interface StartSessionOverride {
  workspaceId?: string | null;
  projectId?: string | null;
  registryId?: string;
  authMethodId?: string | null;
}

export interface UseAgentSessionReturn {
  sessionId: string | null;
  sessionCwd: string | null;
  sessionTitle: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  connectionPhase: AgentConnectionPhase;
  error: string | null;
  authRequest: AgentAuthRequiredPayload | null;
  sendPrompt: (message: string) => void;
  sendPermissionResponse: (
    requestId: string,
    allowed: boolean,
    rememberForSession?: boolean
  ) => void;
  sendCancel: () => void;
  startSession: (override?: StartSessionOverride) => Promise<void>;
  resumeSession: (sessionId: string) => Promise<boolean>;
  clearAuthRequest: () => void;
  disconnect: () => void;
}

function parseAuthRequiredError(err: unknown): AgentAuthRequiredPayload | null {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const idx = raw.indexOf(AUTH_REQUIRED_ERROR_PREFIX);
  if (idx < 0) return null;
  const jsonPart = raw.slice(idx + AUTH_REQUIRED_ERROR_PREFIX.length).trim();
  if (!jsonPart) return null;
  try {
    const parsed = JSON.parse(jsonPart) as Partial<AgentAuthRequiredPayload>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.request_id !== "string" ||
      !Array.isArray(parsed.methods) ||
      typeof parsed.message !== "string"
    ) {
      return null;
    }
    const methods: AgentAuthMethod[] = parsed.methods
      .filter((m): m is AgentAuthMethod => !!m && typeof m.id === "string" && typeof m.name === "string")
      .map((m) => ({ id: m.id, name: m.name, description: m.description }));
    return {
      request_id: parsed.request_id,
      methods,
      message: parsed.message,
    };
  } catch {
    return null;
  }
}

export function useAgentSession({
  workspaceId,
  projectId,
  registryId,
  onMessage,
  onConnected,
  onDisconnected,
  onError,
}: UseAgentSessionOptions): UseAgentSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCwd, setSessionCwd] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionPhase, setConnectionPhase] = useState<AgentConnectionPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [authRequest, setAuthRequest] = useState<AgentAuthRequiredPayload | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

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

  const sendCancel = useCallback(
    () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "cancel" })
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
    setSessionCwd(null);
    setSessionTitle(null);
    setIsConnected(false);
    setConnectionPhase("idle");
    setError(null);
    setAuthRequest(null);
  }, []);

  const startSession = useCallback(
    async (override?: StartSessionOverride) => {
      setIsConnecting(true);
      setConnectionPhase(override?.authMethodId ? "authenticating" : "initializing");
      setError(null);
      setAuthRequest(null);
      const w = override?.workspaceId ?? workspaceId;
      const p = override?.projectId ?? projectId;
      const r = override?.registryId ?? registryId;
      try {
        setConnectionPhase("creating_session");
        const res = await agentApi.createSession(w ?? null, p ?? null, r, override?.authMethodId);
        const sid = res.session_id;
        setSessionId(sid);
        setSessionCwd(res.cwd);
        setSessionTitle(res.title ?? null);

        const wsBase = getAgentWsBase();
        const wsUrl = `${wsBase}/ws/agent/${sid}`;
        setConnectionPhase("connecting_ws");
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        // Track whether ACP connection ever succeeded for this WS instance.
        let didConnect = false;

        ws.onopen = () => {
          // WS is open, but ACP connection may still be initializing.
          // Wait for phase_update "connected" before marking as ready.
        };

        ws.onmessage = (e) => {
          // Ignore events from a stale WebSocket that was already replaced
          if (wsRef.current !== ws) return;
          try {
            const msg = JSON.parse(e.data) as AgentServerMessage;
            if (msg.type === "phase_update") {
              const phaseMap: Record<string, AgentConnectionPhase> = {
                initializing: "initializing",
                spawning_agent: "initializing",
                creating_session: "creating_session",
                connected: "connected",
              };
              const mapped = phaseMap[msg.phase] ?? "initializing";
              setConnectionPhase(mapped);
              if (mapped === "connected") {
                didConnect = true;
                setIsConnecting(false);
                setIsConnected(true);
                setError(null);
                setAuthRequest(null);
                onConnected?.();
              }
              return;
            }
            // Handle auth-required error from ACP connection phase
            if (msg.type === "error" && msg.code === "ACP_AUTH_REQUIRED") {
              setIsConnecting(false);
              setConnectionPhase("idle");
              try {
                const parsed = JSON.parse(msg.message) as Partial<AgentAuthRequiredPayload>;
                if (parsed && Array.isArray(parsed.methods)) {
                  setAuthRequest(parsed as AgentAuthRequiredPayload);
                  return;
                }
              } catch { /* fall through */ }
              setError(msg.message);
              return;
            }
            onMessageRef.current?.(msg);
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = () => {
          // Only reset state if this is still the active WebSocket
          if (wsRef.current !== ws) return;
          wsRef.current = null;
          setIsConnecting(false);
          setIsConnected(false);
          setConnectionPhase("idle");
          // If we never successfully connected (ACP setup failed), clear sessionId
          // so the auto-reconnect effect doesn't spuriously try to resume this dead session.
          if (!didConnect) {
            setSessionId(null);
            setSessionCwd(null);
          }
          onDisconnected?.();
        };

        ws.onerror = () => {
          if (wsRef.current !== ws) return;
          setError("WebSocket error");
          onError?.("WebSocket error");
        };
      } catch (err) {
        setIsConnecting(false);
        setConnectionPhase("idle");
        const authRequired = parseAuthRequiredError(err);
        if (authRequired) {
          setAuthRequest(authRequired);
          setError(null);
          return;
        }
        const msg = err instanceof Error ? err.message : "Failed to create session";
        setError(msg);
        onError?.(msg);
      }
    },
    [workspaceId, projectId, registryId, onConnected, onDisconnected, onError]
  );

  const resumeSession = useCallback(
    async (sessionIdToResume: string) => {
      setIsConnecting(true);
      setConnectionPhase("resuming_session");
      setError(null);
      setAuthRequest(null);
      try {
        const res = await agentApi.resumeSession(sessionIdToResume);
        const sid = res.session_id;
        setSessionId(sid);
        setSessionCwd(res.cwd);
        setSessionTitle(res.title ?? null);

        const wsBase = getAgentWsBase();
        const wsUrl = `${wsBase}/ws/agent/${sid}`;
        setConnectionPhase("connecting_ws");
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        let didConnect = false;

        ws.onopen = () => {
          // WS open, wait for phase_update "connected"
        };

        ws.onmessage = (e) => {
          if (wsRef.current !== ws) return;
          try {
            const msg = JSON.parse(e.data) as AgentServerMessage;
            if (msg.type === "phase_update") {
              const phaseMap: Record<string, AgentConnectionPhase> = {
                initializing: "initializing",
                spawning_agent: "resuming_session",
                creating_session: "resuming_session",
                connected: "connected",
              };
              const mapped = phaseMap[msg.phase] ?? "resuming_session";
              setConnectionPhase(mapped);
              if (mapped === "connected") {
                didConnect = true;
                setIsConnecting(false);
                setIsConnected(true);
                setError(null);
                onConnected?.();
              }
              return;
            }
            if (msg.type === "error" && msg.code === "ACP_AUTH_REQUIRED") {
              setIsConnecting(false);
              setConnectionPhase("idle");
              try {
                const parsed = JSON.parse(msg.message) as Partial<AgentAuthRequiredPayload>;
                if (parsed && Array.isArray(parsed.methods)) {
                  setAuthRequest(parsed as AgentAuthRequiredPayload);
                  return;
                }
              } catch { /* fall through */ }
              setError(msg.message);
              return;
            }
            onMessageRef.current?.(msg);
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = () => {
          if (wsRef.current !== ws) return;
          wsRef.current = null;
          setIsConnecting(false);
          setIsConnected(false);
          setConnectionPhase("idle");
          // If ACP setup failed, clear sessionId to prevent spurious auto-resume loops.
          if (!didConnect) {
            setSessionId(null);
            setSessionCwd(null);
          }
          onDisconnected?.();
        };

        ws.onerror = () => {
          if (wsRef.current !== ws) return;
          setError("WebSocket error");
          onError?.("WebSocket error");
        };
        return true;
      } catch (err) {
        setIsConnecting(false);
        setConnectionPhase("idle");
        const msg = err instanceof Error ? err.message : "Failed to resume session";
        setError(msg);
        onError?.(msg);
        return false;
      }
    },
    [onConnected, onDisconnected, onError]
  );

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    sessionId,
    sessionCwd,
    sessionTitle,
    isConnecting,
    isConnected,
    connectionPhase,
    error,
    authRequest,
    sendPrompt,
    sendCancel,
    sendPermissionResponse,
    startSession,
    resumeSession,
    clearAuthRequest: () => setAuthRequest(null),
    disconnect,
  };
}
