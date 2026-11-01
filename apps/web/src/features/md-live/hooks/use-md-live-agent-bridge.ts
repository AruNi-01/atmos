"use client";

import { useEffect, useMemo } from "react";
import { mdLiveAgentBridgeWsApi } from "@/api/ws-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { applyMdLiveAgentToolToOpenDoc } from "../lib/md-live-edit-host";
import { MD_LIVE_AGENT_CAPABILITY, mdLiveAgentClientId } from "../lib/md-live-agent-chat";

const DISPATCH_EVENT = "md_live_agent_dispatch";

function ignoreBridgeError(): void {}

function reportDispatchFailure(requestId: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  void mdLiveAgentBridgeWsApi
    .postResult({
      request_id: requestId,
      success: false,
      error_code: "MD_LIVE_BRIDGE_OFFLINE",
      error_message: message,
      recoverable: true,
      data: null,
    })
    .catch(ignoreBridgeError);
}

export function useMdLiveAgentBridge(filePath: string): { clientId: string } {
  const clientId = useMemo(() => mdLiveAgentClientId(filePath), [filePath]);
  const isConnected = useWebSocketStore((s) => s.connectionState === "connected");
  const onEvent = useWebSocketStore((s) => s.onEvent);

  useEffect(() => {
    if (!isConnected) return;
    void mdLiveAgentBridgeWsApi
      .register({
        client_id: clientId,
        label: filePath,
        accepts_commands: true,
        capabilities: [MD_LIVE_AGENT_CAPABILITY],
        active_document_file_name: filePath,
      })
      .catch(ignoreBridgeError);
    return () => {
      void mdLiveAgentBridgeWsApi.unregister(clientId).catch(ignoreBridgeError);
    };
  }, [clientId, filePath, isConnected]);

  useEffect(() => {
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
      if (typeof payload.client_id === "string" && payload.client_id !== clientId) return;
      const tool =
        typeof payload.tool === "string"
          ? payload.tool
          : typeof payload.command === "string"
            ? payload.command
            : "";
      if (!tool) return;
      const args =
        payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
          ? (payload.args as Record<string, unknown>)
          : {};
      const requestId = payload.request_id;
      void applyMdLiveAgentToolToOpenDoc({ tool, args, filePath, clientId })
        .then((result) =>
          mdLiveAgentBridgeWsApi.postResult({
            request_id: requestId,
            success: result.success,
            error_code: result.error_code,
            error_message: result.error_message,
            recoverable: result.recoverable,
            data: result.data ?? null,
          }),
        )
        .catch((error) => reportDispatchFailure(requestId, error));
    });
  }, [clientId, filePath, isConnected, onEvent]);

  return { clientId };
}
