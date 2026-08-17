"use client";

import React from "react";
import type { AgentBridge, AgentBridgeDispatch } from "@atmos/pt-design";
import { ptDesignAgentBridgeWsApi } from "@/api/ws-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";

const DISPATCH_EVENT = "pt_design_agent_dispatch";

export function usePtDesignAgentBridge(): AgentBridge | undefined {
  const isConnected = useWebSocketStore((s) => s.connectionState === "connected");
  const onEvent = useWebSocketStore((s) => s.onEvent);
  const listeners = React.useRef(new Set<(dispatch: AgentBridgeDispatch) => void>());

  React.useEffect(() => {
    if (!isConnected) return;
    return onEvent(DISPATCH_EVENT, (raw) => {
      const payload = raw as {
        request_id?: unknown;
        tool?: unknown;
        command?: unknown;
        args?: unknown;
        client_id?: unknown;
      } | null;
      if (!payload || typeof payload.request_id !== "string") return;
      const tool =
        typeof payload.tool === "string"
          ? payload.tool
          : typeof payload.command === "string"
            ? payload.command
            : "";
      if (!tool) return;
      const dispatch: AgentBridgeDispatch = {
        request_id: payload.request_id,
        tool,
        args:
          payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
            ? (payload.args as Record<string, unknown>)
            : {},
        client_id: typeof payload.client_id === "string" ? payload.client_id : undefined,
      };
      for (const listener of listeners.current) listener(dispatch);
    });
  }, [isConnected, onEvent]);

  return React.useMemo(() => {
    if (!isConnected) return undefined;
    return {
      register: (payload) =>
        ptDesignAgentBridgeWsApi.register({
          client_id: payload.client_id,
          label: payload.label ?? "Prototype Design",
          accepts_commands: true,
          capabilities: ["pt-design.v1"],
        }),
      unregister: (clientId) => ptDesignAgentBridgeWsApi.unregister(clientId),
      subscribe: (handler) => {
        listeners.current.add(handler);
        return () => {
          listeners.current.delete(handler);
        };
      },
      reply: (result) =>
        ptDesignAgentBridgeWsApi.postResult({
          request_id: result.request_id,
          success: result.success,
          error_code: result.error_code,
          error_message: result.error_message,
          recoverable: result.recoverable,
          data: result.data,
        }),
    };
  }, [isConnected]);
}
