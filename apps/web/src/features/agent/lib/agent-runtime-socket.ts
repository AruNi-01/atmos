"use client";

import type React from "react";
import {
  getAgentWsBase,
  type AgentAuthMethod,
  type AgentAuthRequiredPayload,
  type AgentCapabilities,
  type AgentImplementationInfo,
} from "@/api/rest-api";
import { getRuntimeApiConfig } from "@/shared/lib/desktop-runtime";

export const AUTH_REQUIRED_ERROR_PREFIX = "ACP_AUTH_REQUIRED::";

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
      type: "agent_info_update";
      agent_info: AgentImplementationInfo | null;
    }
  | {
      type: "capabilities_update";
      capabilities: AgentCapabilities;
    }
  | {
      type: "session_ready";
      runtime_session_id: string;
      acp_session_id: string;
    }
  | {
      type: "session_info_update";
      acp_session_id: string;
      title?: string | null;
      cwd?: string | null;
      updated_at?: string | null;
    }
  | {
      type: "session_closed";
      reason?: string | null;
    }
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

export function mergeConfigOptions(
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

export function parseAuthRequiredError(err: unknown): AgentAuthRequiredPayload | null {
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

export function closeAgentWebSocket(ws: WebSocket) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: "close_session" }));
    } catch {
      // The browser may reject sends while the socket is already closing.
    }
  }
  ws.close();
}

type RuntimeSocketMode = "new" | "resume";

interface RuntimeSocketCallbacks {
  onPhaseChange: (phase: AgentConnectionPhase) => void;
  onUsageUpdate: (usage: AgentUsage, message: AgentServerMessage) => void;
  onAgentInfoUpdate: (info: AgentImplementationInfo | null, message: AgentServerMessage) => void;
  onCapabilitiesUpdate: (capabilities: AgentCapabilities, message: AgentServerMessage) => void;
  onSessionReady: (message: Extract<AgentServerMessage, { type: "session_ready" }>) => void;
  onSessionInfoUpdate: (message: Extract<AgentServerMessage, { type: "session_info_update" }>) => void;
  onSessionClosed: (message: Extract<AgentServerMessage, { type: "session_closed" }>) => void;
  onConfigOptionsUpdate: (options: AgentConfigOption[]) => void;
  onAuthRequired: (payload: AgentAuthRequiredPayload | null, fallbackMessage: string) => void;
  onUnhandledMessage: (message: AgentServerMessage) => void;
  onSocketClosed: (didConnect: boolean) => void;
  onSocketError: (message: string) => void;
}

export async function connectAgentRuntimeSocket({
  runtimeSessionId,
  mode,
  wsRef,
  callbacks,
}: {
  runtimeSessionId: string;
  mode: RuntimeSocketMode;
  wsRef: React.MutableRefObject<WebSocket | null>;
  callbacks: RuntimeSocketCallbacks;
}): Promise<WebSocket> {
  const wsBase = await getAgentWsBase();
  const cfg = await getRuntimeApiConfig();
  const wsUrl = `${wsBase}/ws/agent/${runtimeSessionId}${cfg.token ? `?token=${encodeURIComponent(cfg.token)}` : ""}`;
  const ws = new WebSocket(wsUrl);
  wsRef.current = ws;
  let didConnect = false;

  ws.onopen = () => {
    // WS is open, but ACP connection may still be initializing.
    // Wait for phase_update "connected" before marking as ready.
  };

  ws.onmessage = (event) => {
    if (wsRef.current !== ws) return;
    try {
      const msg = JSON.parse(event.data) as AgentServerMessage;
      switch (msg.type) {
        case "phase_update":
          callbacks.onPhaseChange(mapRuntimePhase(msg.phase, mode));
          return;
        case "usage_update":
          callbacks.onUsageUpdate(msg.usage, msg);
          return;
        case "agent_info_update":
          callbacks.onAgentInfoUpdate(msg.agent_info, msg);
          return;
        case "capabilities_update":
          callbacks.onCapabilitiesUpdate(msg.capabilities, msg);
          return;
        case "session_ready":
          didConnect = true;
          callbacks.onSessionReady(msg);
          return;
        case "session_info_update":
          callbacks.onSessionInfoUpdate(msg);
          return;
        case "session_closed":
          callbacks.onSessionClosed(msg);
          return;
        case "config_options_update":
          if (Array.isArray(msg.configOptions)) {
            callbacks.onConfigOptionsUpdate(msg.configOptions);
          }
          return;
        case "error":
          if (msg.code === "ACP_AUTH_REQUIRED") {
            let payload: AgentAuthRequiredPayload | null = null;
            try {
              const parsed = JSON.parse(msg.message) as Partial<AgentAuthRequiredPayload>;
              if (parsed && Array.isArray(parsed.methods)) {
                payload = parsed as AgentAuthRequiredPayload;
              }
            } catch {
              // Fall through to the message fallback.
            }
            callbacks.onAuthRequired(payload, msg.message);
            return;
          }
          break;
      }
      callbacks.onUnhandledMessage(msg);
    } catch {
      // Ignore parse errors from malformed socket messages.
    }
  };

  ws.onclose = () => {
    if (wsRef.current !== ws) return;
    wsRef.current = null;
    callbacks.onSocketClosed(didConnect);
  };

  ws.onerror = () => {
    if (wsRef.current !== ws) return;
    callbacks.onSocketError("WebSocket error");
  };

  return ws;
}

function mapRuntimePhase(phase: string, mode: RuntimeSocketMode): AgentConnectionPhase {
  if (mode === "resume") {
    const resumePhaseMap: Record<string, AgentConnectionPhase> = {
      initializing: "resuming_session",
      spawning_agent: "resuming_session",
      creating_session: "resuming_session",
      connected: "connected",
    };
    return resumePhaseMap[phase] ?? "resuming_session";
  }

  const newPhaseMap: Record<string, AgentConnectionPhase> = {
    initializing: "initializing",
    spawning_agent: "initializing",
    creating_session: "creating_session",
    connected: "connected",
  };
  return newPhaseMap[phase] ?? "initializing";
}
