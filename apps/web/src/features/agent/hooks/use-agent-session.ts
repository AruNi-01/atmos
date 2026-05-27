"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  agentApi,
  type AgentAuthRequiredPayload,
  type AgentCapabilities,
  type AgentImplementationInfo,
} from "@/api/rest-api";
import {
  closeAgentWebSocket,
  connectAgentRuntimeSocket,
  mergeConfigOptions,
  parseAuthRequiredError,
  type AgentConfigOption,
  type AgentConnectionPhase,
  type AgentServerMessage,
  type AgentUsage,
} from "@/features/agent/lib/agent-runtime-socket";

export type {
  AcpPermissionOption,
  AgentConfigOption,
  AgentConfigOptionValue,
  AgentConnectionPhase,
  AgentCost,
  AgentPlan,
  AgentPlanEntry,
  AgentServerMessage,
  AgentToolCallContentItem,
  AgentTurnUsage,
  AgentUsage,
} from "@/features/agent/lib/agent-runtime-socket";

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

export interface ResumeSessionInput {
  registryId: string;
  acpSessionId: string;
  cwd?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  authMethodId?: string | null;
}

/** Snapshot of a live session that can be stashed and restored later. */
export interface StashedSession {
  ws: WebSocket;
  sessionId: string;
  acpSessionId: string | null;
  cwd: string | null;
  title: string | null;
  agentInfo: AgentImplementationInfo | null;
  capabilities: AgentCapabilities | null;
  configOptions: AgentConfigOption[];
  sessionUsage: AgentUsage | null;
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
  agentInfo: AgentImplementationInfo | null;
  capabilities: AgentCapabilities | null;
  sendPrompt: (message: string) => boolean;
  sendPermissionResponse: (
    requestId: string,
    allowed: boolean,
    rememberForSession?: boolean
  ) => void;
  sendCancel: () => void;
  startSession: (override?: StartSessionOverride) => Promise<void>;
  resumeSession: (input: ResumeSessionInput) => Promise<boolean>;
  clearAuthRequest: () => void;
  disconnect: () => void;
  /** Move the current session to an internal stash (keyed by `key`).
   *  The WebSocket stays open in the background; call `unstashSession`
   *  to bring it back instantly. */
  stashSession: (key: string) => void;
  /** Restore a previously stashed session.  Returns the restored sessionId
   *  if the stash existed and the WebSocket was still alive, else null. */
  unstashSession: (key: string) => string | null;
  /** Close a specific stashed session (or all if no key). */
  disconnectStashed: (key?: string) => void;
  configOptions: AgentConfigOption[];
  sessionUsage: AgentUsage | null;
  setConfigOption: (id: string, value: string) => void;
  setAgentDefaultConfig: (configId: string, value: string) => void;
  logoutAgent: (cwd?: string | null, authMethodId?: string | null) => Promise<boolean>;
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
  const [acpSessionId, setAcpSessionId] = useState<string | null>(null);
  const [sessionCwd, setSessionCwd] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionPhase, setConnectionPhase] = useState<AgentConnectionPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [authRequest, setAuthRequest] = useState<AgentAuthRequiredPayload | null>(null);
  const [sessionUsage, setSessionUsage] = useState<AgentUsage | null>(null);
  const [configOptions, setConfigOptions] = useState<AgentConfigOption[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentImplementationInfo | null>(null);
  const [capabilities, setCapabilities] = useState<AgentCapabilities | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const cancelledRef = useRef(false);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const sendPrompt = useCallback(
    (message: string): boolean => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "prompt", message })
        );
        return true;
      }
      return false;
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

  const setConfigOption = useCallback(
    (configId: string, value: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "set_config_option", option_id: configId, value })
        );
      }
      // Optimistically update local state so UI responds immediately
      setConfigOptions(prevOpts => 
        prevOpts.map(opt => 
          opt.id === configId ? { ...opt, currentValue: value } : opt
        )
      );
    },
    []
  );

  const setAgentDefaultConfig = useCallback(
    (configId: string, value: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "set_agent_default_config",
            config_id: configId,
            value,
            registry_id: registryId,
          })
        );
      }
    },
    [registryId]
  );

  // Ref that always reflects the latest state values so stable callbacks can
  // read them without adding state to their dependency arrays.
  const latestRef = useRef({
    sessionId: null as string | null,
    acpSessionId: null as string | null,
    cwd: null as string | null,
    title: null as string | null,
    agentInfo: null as AgentImplementationInfo | null,
    capabilities: null as AgentCapabilities | null,
    configOptions: [] as AgentConfigOption[],
    sessionUsage: null as AgentUsage | null,
  });
  useEffect(() => {
    latestRef.current = {
      sessionId,
      acpSessionId,
      cwd: sessionCwd,
      title: sessionTitle,
      agentInfo,
      capabilities,
      configOptions,
      sessionUsage,
    };
  });

  const stashedRef = useRef<Map<string, StashedSession>>(new Map());

  const clearActiveState = useCallback(() => {
    setSessionId(null);
    setAcpSessionId(null);
    setSessionCwd(null);
    setSessionTitle(null);
    setIsConnecting(false);
    setIsConnected(false);
    setConnectionPhase("idle");
    setError(null);
    setAuthRequest(null);
    setSessionUsage(null);
    setConfigOptions([]);
    setAgentInfo(null);
    setCapabilities(null);
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      closeAgentWebSocket(wsRef.current);
      wsRef.current = null;
    }
    clearActiveState();
  }, [clearActiveState]);

  const logoutAgent = useCallback(
    async (cwd?: string | null, authMethodId?: string | null): Promise<boolean> => {
      if (!registryId) return false;
      try {
        await agentApi.logoutAgent(registryId, cwd ?? sessionCwd, authMethodId ?? null);
        disconnect();
        setAuthRequest(null);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to logout agent";
        setError(msg);
        onError?.(msg);
        return false;
      }
    },
    [disconnect, onError, registryId, sessionCwd],
  );

  const stashSession = useCallback((key: string) => {
    const ws = wsRef.current;
    const {
      sessionId: sid,
      acpSessionId: acpSid,
      cwd,
      title,
      agentInfo: info,
      capabilities: caps,
      configOptions: opts,
      sessionUsage: usage,
    } = latestRef.current;

    if (ws && ws.readyState === WebSocket.OPEN && sid) {
      stashedRef.current.set(key, {
        ws,
        sessionId: sid,
        acpSessionId: acpSid,
        cwd,
        title,
        agentInfo: info,
        capabilities: caps,
        configOptions: opts,
        sessionUsage: usage,
      });
      // Detach without closing – the WS stays alive in the background.
      // Existing onmessage/onclose handlers check `wsRef.current !== ws`
      // and will no-op while the session is stashed.
      wsRef.current = null;
    } else if (ws) {
      closeAgentWebSocket(ws);
      wsRef.current = null;
    }

    clearActiveState();
  }, [clearActiveState]);

  const unstashSession = useCallback((key: string): string | null => {
    const stashed = stashedRef.current.get(key);
    if (!stashed) return null;
    stashedRef.current.delete(key);

    if (stashed.ws.readyState !== WebSocket.OPEN) {
      closeAgentWebSocket(stashed.ws);
      return null;
    }

    // Close any current active connection first.
    if (wsRef.current) {
      closeAgentWebSocket(wsRef.current);
      wsRef.current = null;
    }

    // Re-attach: set wsRef so existing onmessage/onclose handlers resume.
    wsRef.current = stashed.ws;
    setSessionId(stashed.sessionId);
    setAcpSessionId(stashed.acpSessionId);
    setSessionCwd(stashed.cwd);
    setSessionTitle(stashed.title);
    setAgentInfo(stashed.agentInfo);
    setCapabilities(stashed.capabilities);
    setConfigOptions(stashed.configOptions);
    setSessionUsage(stashed.sessionUsage);
    setIsConnecting(false);
    setIsConnected(true);
    setConnectionPhase("connected");
    setError(null);
    setAuthRequest(null);

    return stashed.sessionId;
  }, []);

  const disconnectStashed = useCallback((key?: string) => {
    if (key !== undefined) {
      const s = stashedRef.current.get(key);
      if (s) {
        closeAgentWebSocket(s.ws);
        stashedRef.current.delete(key);
      }
    } else {
      for (const [, s] of stashedRef.current) closeAgentWebSocket(s.ws);
      stashedRef.current.clear();
    }
  }, []);

  const attachRuntimeSessionSocket = useCallback(
    async (runtimeSessionId: string, mode: "new" | "resume") => {
      setConnectionPhase("connecting_ws");
      await connectAgentRuntimeSocket({
        runtimeSessionId,
        mode,
        wsRef,
        callbacks: {
          onPhaseChange: setConnectionPhase,
          onUsageUpdate: (usage, msg) => {
            setSessionUsage(usage);
            onMessageRef.current?.(msg);
          },
          onAgentInfoUpdate: (info, msg) => {
            setAgentInfo(info);
            onMessageRef.current?.(msg);
          },
          onCapabilitiesUpdate: (caps, msg) => {
            setCapabilities(caps);
            onMessageRef.current?.(msg);
          },
          onSessionReady: (msg) => {
            setSessionId(msg.runtime_session_id);
            setAcpSessionId(msg.acp_session_id);
            setIsConnecting(false);
            setIsConnected(true);
            setConnectionPhase("connected");
            setError(null);
            setAuthRequest(null);
            onConnected?.();
            onMessageRef.current?.(msg);
          },
          onSessionInfoUpdate: (msg) => {
            if ("title" in msg) setSessionTitle(msg.title ?? null);
            if ("cwd" in msg) setSessionCwd(msg.cwd ?? null);
            onMessageRef.current?.(msg);
          },
          onSessionClosed: (msg) => {
            setIsConnected(false);
            setConnectionPhase("idle");
            onMessageRef.current?.(msg);
          },
          onConfigOptionsUpdate: (options) => {
            setConfigOptions((prev) => mergeConfigOptions(prev, options));
          },
          onAuthRequired: (payload, fallbackMessage) => {
            setIsConnecting(false);
            setConnectionPhase("idle");
            if (payload) {
              setAuthRequest(payload);
            } else {
              setError(fallbackMessage);
            }
          },
          onUnhandledMessage: (msg) => {
            onMessageRef.current?.(msg);
          },
          onSocketClosed: (didConnect) => {
            setIsConnecting(false);
            setIsConnected(false);
            setConnectionPhase("idle");
            if (!didConnect) {
              setSessionId(null);
              setAcpSessionId(null);
              setSessionCwd(null);
            }
            onDisconnected?.();
          },
          onSocketError: (message) => {
            setError(message);
            onError?.(message);
          },
        },
      });
    },
    [onConnected, onDisconnected, onError],
  );

  const startSession = useCallback(
    async (override?: StartSessionOverride) => {
      setIsConnecting(true);
      setConnectionPhase(override?.authMethodId ? "authenticating" : "initializing");
      setError(null);
      setAuthRequest(null);
      setSessionUsage(null);
      setConfigOptions([]);
      const w = override?.workspaceId ?? workspaceId;
      const p = override?.projectId ?? projectId;
      const r = override?.registryId ?? registryId;
      try {
        setConnectionPhase("creating_session");
        const res = await agentApi.createSession(w ?? null, p ?? null, r, override?.authMethodId);

        if (cancelledRef.current) {
          return;
        }

        const sid = res.runtime_session_id;
        setSessionId(sid);
        setAcpSessionId(null);
        setSessionCwd(res.cwd);
        setSessionTitle(null);
        await attachRuntimeSessionSocket(sid, "new");
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
    [attachRuntimeSessionSocket, workspaceId, projectId, registryId, onError]
  );

  const resumeSession = useCallback(
    async (input: ResumeSessionInput) => {
      setIsConnecting(true);
      setConnectionPhase("resuming_session");
      setError(null);
      setAuthRequest(null);
      setSessionUsage(null);
      setConfigOptions([]);
      try {
        const res = await agentApi.resumeSession(
          input.registryId,
          input.acpSessionId,
          input.cwd,
          input.workspaceId ?? workspaceId,
          input.projectId ?? projectId,
          input.authMethodId,
        );

        if (cancelledRef.current) {
          return false;
        }

        const sid = res.runtime_session_id;
        setSessionId(sid);
        setAcpSessionId(res.acp_session_id);
        setSessionCwd(res.cwd);
        setSessionTitle(null);
        await attachRuntimeSessionSocket(sid, "resume");
        return true;
      } catch (err) {
        setIsConnecting(false);
        setConnectionPhase("idle");
        const authRequired = parseAuthRequiredError(err);
        if (authRequired) {
          setAuthRequest(authRequired);
          setError(null);
          return false;
        }
        const msg = err instanceof Error ? err.message : "Failed to resume session";
        setError(msg);
        onError?.(msg);
        return false;
      }
    },
    [attachRuntimeSessionSocket, onError, projectId, workspaceId]
  );

  useEffect(() => {
    cancelledRef.current = false;
    const stashedSessions = stashedRef.current;
    return () => {
      cancelledRef.current = true;
      disconnect();
      for (const [, s] of stashedSessions) closeAgentWebSocket(s.ws);
      stashedSessions.clear();
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
    agentInfo,
    capabilities,
    sendPrompt,
    sendCancel,
    sendPermissionResponse,
    startSession,
    resumeSession,
    clearAuthRequest: () => setAuthRequest(null),
    disconnect,
    stashSession,
    unstashSession,
    disconnectStashed,
    configOptions,
    sessionUsage,
    setConfigOption,
    setAgentDefaultConfig,
    logoutAgent,
  };
}
