"use client";

import React from "react";
import type { AgentBridge, AgentBridgeDispatch } from "@atmos/pt-design";
import { ptDesignAgentBridgeWsApi } from "@/api/ws-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { AgentSurfaceActivityStore } from "@/shared/lib/agent-surface-activity";
import {
  AgentSurfaceFeedStore,
  screenshotFromToolData,
} from "@/shared/lib/agent-surface-feed";
import { describePtDesignAgentCommand } from "./lib/pt-design-agent-feed-labels";
import { instanceIdsFromToolData } from "./lib/pt-design-agent-targets";

const DISPATCH_EVENT = "pt_design_agent_dispatch";

export function usePtDesignAgentBridge(clientId?: string): {
  bridge: AgentBridge | undefined;
  feed: AgentSurfaceFeedStore;
  activity: AgentSurfaceActivityStore;
} {
  const isConnected = useWebSocketStore((s) => s.connectionState === "connected");
  const onEvent = useWebSocketStore((s) => s.onEvent);
  const listeners = React.useRef(new Set<(dispatch: AgentBridgeDispatch) => void>());
  const [feed] = React.useState(() => new AgentSurfaceFeedStore(describePtDesignAgentCommand));
  const [activity] = React.useState(() => new AgentSurfaceActivityStore());

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

  const bridge = React.useMemo((): AgentBridge | undefined => {
    if (!isConnected) return undefined;
    return {
      register: async (payload) => {
        await ptDesignAgentBridgeWsApi.register({
          client_id: payload.client_id,
          label: payload.label ?? "Prototype Design",
          accepts_commands: true,
          capabilities: ["pt-design.v1"],
        });
      },
      unregister: async (clientId) => {
        await ptDesignAgentBridgeWsApi.unregister(clientId);
      },
      subscribe: (handler) => {
        const wrapped: (dispatch: AgentBridgeDispatch) => void = (dispatch) => {
          if (clientId && dispatch.client_id && dispatch.client_id !== clientId) {
            handler(dispatch);
            return;
          }
          feed.begin(dispatch.request_id, dispatch.tool, dispatch.args ?? null);
          activity.beginWork();
          handler(dispatch);
        };
        listeners.current.add(wrapped);
        return () => {
          listeners.current.delete(wrapped);
        };
      },
      reply: async (result) => {
        const screenshot = result.success ? screenshotFromToolData(result.data) : null;
        feed.finalizeRequest(
          result.request_id,
          result.success,
          screenshot ? { screenshot } : undefined,
        );
        if (result.success) {
          activity.record(result.request_id, instanceIdsFromToolData(result.data));
        }
        activity.endWork();
        await ptDesignAgentBridgeWsApi.postResult({
          request_id: result.request_id,
          success: result.success,
          error_code: result.error_code,
          error_message: result.error_message,
          recoverable: result.recoverable,
          data: result.data,
        });
      },
    };
  }, [activity, clientId, feed, isConnected]);

  return { bridge, feed, activity };
}
