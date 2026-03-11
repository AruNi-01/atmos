"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi, getAgentWsBase, type AgentAuthMethod, type AgentAuthRequiredPayload } from "@/api/rest-api";
import { getRuntimeApiConfig } from "@/lib/desktop-runtime";
import type { AgentChatMode } from "@/types/agent-chat";

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
      parent_tool_call_id?: string;
      tool: string;
      description: string;
      status: "running" | "completed" | "failed";
      raw_input?: unknown;
      content?: AgentToolCallContentItem[];
      raw_output?: unknown;
      detail?: unknown;
    }
  | {
      type: "permission_request";
      request_id: string;
      tool: string;
      description: string;
      content_markdown?: string;
      risk_level: string;
      options: AcpPermissionOption[];
    }
  | { type: "error"; code: string; message: string; recoverable: boolean }
  | { type: "turn_end"; usage?: AgentTurnUsage }
  | { type: "session_ended" }
  | { type: "load_completed" }
  | { type: "phase_update"; phase: string }
  | {
      type: "config_options_update";
      configOptions: AgentConfigOption[];
    }
  | {
      type: "plan_update";
      plan: AgentPlan;
    }
  | {
      type: "usage_update";
      usage: AgentUsage;
    }
  | {
      type: "session_title_updated";
      title: string;
      title_source: string;
    };

export interface AgentCost {
  amount?: number;
  currency?: string;
}

export interface AgentUsage {
  used?: number;
  size?: number;
  cost?: AgentCost;
}

export interface AgentTurnUsage {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  cachedReadTokens?: number;
  cachedWriteTokens?: number;
}

export interface AgentPlanEntry {
  content: string;
  priority: string;
  status: string;
}

export interface AgentPlan {
  entries: AgentPlanEntry[];
}

export interface AgentConfigOptionValue {
  value: string;
  name?: string;
  description?: string;
}

export interface AgentConfigOption {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  type: "select" | string;
  currentValue?: string;
  options: AgentConfigOptionValue[];
}

export type AgentToolCallContentItem =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "diff";
      path?: string;
      old_content?: string;
      new_content: string;
    }
  | {
      type: "terminal";
      terminal_id: string;
    };

function mergeConfigOptions(
  prev: AgentConfigOption[],
  incoming: AgentConfigOption[],
): AgentConfigOption[] {
  if (prev.length === 0) return incoming;

  const merged = [...prev];
  for (const inc of incoming) {
    const idx = merged.findIndex((o) => o.id === inc.id);
    if (idx >= 0) {
      if (inc.options.length > 0) {
        merged[idx] = inc;
      } else {
        merged[idx] = { ...merged[idx], currentValue: inc.currentValue };
      }
    } else if (inc.options.length > 0) {
      merged.push(inc);
    }
  }
  return merged;
}

export interface UseAgentSessionOptions {
  workspaceId: string | null;
  projectId: string | null;
  registryId: string;
  mode: AgentChatMode;
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
  mode?: AgentChatMode;
}

/** Snapshot of a live session that can be stashed and restored later. */
export interface StashedSession {
  ws: WebSocket;
  sessionId: string;
  cwd: string | null;
  title: string | null;
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
  sendPrompt: (message: string) => boolean;
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
  mode,
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
  const [sessionUsage, setSessionUsage] = useState<AgentUsage | null>(null);
  const [configOptions, setConfigOptions] = useState<AgentConfigOption[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
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
          JSON.stringify({ type: "set_config_option", config_id: configId, value })
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
    cwd: null as string | null,
    title: null as string | null,
    configOptions: [] as AgentConfigOption[],
    sessionUsage: null as AgentUsage | null,
  });
  useEffect(() => {
    latestRef.current = { sessionId, cwd: sessionCwd, title: sessionTitle, configOptions, sessionUsage };
  });

  const stashedRef = useRef<Map<string, StashedSession>>(new Map());

  const clearActiveState = useCallback(() => {
    setSessionId(null);
    setSessionCwd(null);
    setSessionTitle(null);
    setIsConnecting(false);
    setIsConnected(false);
    setConnectionPhase("idle");
    setError(null);
    setAuthRequest(null);
    setSessionUsage(null);
    setConfigOptions([]);
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    clearActiveState();
  }, [clearActiveState]);

  const stashSession = useCallback((key: string) => {
    const ws = wsRef.current;
    const { sessionId: sid, cwd, title, configOptions: opts, sessionUsage: usage } = latestRef.current;

    if (ws && ws.readyState === WebSocket.OPEN && sid) {
      stashedRef.current.set(key, { ws, sessionId: sid, cwd, title, configOptions: opts, sessionUsage: usage });
      // Detach without closing – the WS stays alive in the background.
      // Existing onmessage/onclose handlers check `wsRef.current !== ws`
      // and will no-op while the session is stashed.
      wsRef.current = null;
    } else if (ws) {
      ws.close();
      wsRef.current = null;
    }

    clearActiveState();
  }, [clearActiveState]);

  const unstashSession = useCallback((key: string): string | null => {
    const stashed = stashedRef.current.get(key);
    if (!stashed) return null;
    stashedRef.current.delete(key);

    if (stashed.ws.readyState !== WebSocket.OPEN) {
      stashed.ws.close();
      return null;
    }

    // Close any current active connection first.
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Re-attach: set wsRef so existing onmessage/onclose handlers resume.
    wsRef.current = stashed.ws;
    setSessionId(stashed.sessionId);
    setSessionCwd(stashed.cwd);
    setSessionTitle(stashed.title);
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
      if (s) { s.ws.close(); stashedRef.current.delete(key); }
    } else {
      for (const [, s] of stashedRef.current) s.ws.close();
      stashedRef.current.clear();
    }
  }, []);

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
      const m = override?.mode ?? mode;
      try {
        setConnectionPhase("creating_session");
        const res = await agentApi.createSession(w ?? null, p ?? null, r, override?.authMethodId, m);
        const sid = res.session_id;
        setSessionId(sid);
        setSessionCwd(res.cwd);
        setSessionTitle(res.title ?? null);

        const wsBase = await getAgentWsBase();
        const cfg = await getRuntimeApiConfig();
        const wsUrl = `${wsBase}/ws/agent/${sid}${cfg.token ? `?token=${encodeURIComponent(cfg.token)}` : ""}`;
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
            if (msg.type === "usage_update") {
              setSessionUsage(msg.usage);
              onMessageRef.current?.(msg);
              return;
            }
            if (msg.type === "config_options_update") {
              if (Array.isArray(msg.configOptions)) {
                setConfigOptions((prev) =>
                  mergeConfigOptions(prev, msg.configOptions as AgentConfigOption[])
                );
              }
              return;
            }
            if (msg.type === "session_title_updated") {
              setSessionTitle(msg.title);
              onMessageRef.current?.(msg);
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
    [workspaceId, projectId, registryId, mode, onConnected, onDisconnected, onError]
  );

  const resumeSession = useCallback(
    async (sessionIdToResume: string) => {
      setIsConnecting(true);
      setConnectionPhase("resuming_session");
      setError(null);
      setAuthRequest(null);
      setSessionUsage(null);
      setConfigOptions([]);
      try {
        const res = await agentApi.resumeSession(sessionIdToResume, mode);
        const sid = res.session_id;
        setSessionId(sid);
        setSessionCwd(res.cwd);
        setSessionTitle(res.title ?? null);

        const wsBase = await getAgentWsBase();
        const cfg = await getRuntimeApiConfig();
        const wsUrl = `${wsBase}/ws/agent/${sid}${cfg.token ? `?token=${encodeURIComponent(cfg.token)}` : ""}`;
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
              // When resuming, show "Restoring" instead of "Initializing".
              const phaseMap: Record<string, AgentConnectionPhase> = {
                initializing: "resuming_session",
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
            if (msg.type === "usage_update") {
              setSessionUsage(msg.usage);
              onMessageRef.current?.(msg);
              return;
            }
            if (msg.type === "config_options_update") {
              if (Array.isArray(msg.configOptions)) {
                setConfigOptions((prev) =>
                  mergeConfigOptions(prev, msg.configOptions as AgentConfigOption[])
                );
              }
              return;
            }
            if (msg.type === "session_title_updated") {
              setSessionTitle(msg.title);
              onMessageRef.current?.(msg);
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
    [mode, onConnected, onDisconnected, onError]
  );

  useEffect(() => {
    return () => {
      disconnect();
      // Also close all stashed sessions on unmount.
      for (const [, s] of stashedRef.current) s.ws.close();
      stashedRef.current.clear();
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
    stashSession,
    unstashSession,
    disconnectStashed,
    configOptions,
    sessionUsage,
    setConfigOption,
    setAgentDefaultConfig,
  };
}
