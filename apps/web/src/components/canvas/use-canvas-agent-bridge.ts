"use client";

import * as React from "react";
import type { Editor } from "tldraw";

import { canvasAgentBridgeWsApi } from "@/api/ws-api";
import { getActiveInstanceId } from "@/hooks/use-connection-store";
import { useUiPrefStore } from "@/hooks/use-ui-pref-store";
import { useWebSocketStore } from "@/hooks/use-websocket";
import { CanvasAgentBus, type CanvasAgentDispatchInput } from "./canvas-agent-bus";
import { CanvasAgentActivityStore } from "./canvas-agent-activity";

const DEFAULT_CANVAS_PREFS = {
  sessionByBoard: {} as Record<string, unknown>,
  agentClientId: null as string | null,
  acceptsCommands: false,
};

const DISPATCH_EVENT = "canvas_agent_dispatch";

function loadOrCreateClientId(): string {
  if (typeof window === "undefined") return "ssr-client";
  const instanceId = getActiveInstanceId();
  const prefs = useUiPrefStore.getState().readSlice(instanceId, "canvas", DEFAULT_CANVAS_PREFS);
  if (prefs.agentClientId) {
    return prefs.agentClientId;
  }
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client-${Math.random().toString(36).slice(2, 10)}`;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    "canvas",
    prev => ({ ...prev, agentClientId: generated }),
    DEFAULT_CANVAS_PREFS,
  );
  return generated;
}

function loadAcceptsCommands(): boolean {
  if (typeof window === "undefined") return false;
  const instanceId = getActiveInstanceId();
  return useUiPrefStore.getState().readSlice(instanceId, "canvas", DEFAULT_CANVAS_PREFS)
    .acceptsCommands;
}

export interface CanvasAgentBridgeState {
  clientId: string;
  acceptsCommands: boolean;
  isConnected: boolean;
  setAcceptsCommands: (value: boolean) => void;
  activity: CanvasAgentActivityStore;
}

export function useCanvasAgentBridge(editor: Editor | null): CanvasAgentBridgeState {
  const isConnected = useWebSocketStore((s) => s.connectionState === "connected");
  const onEvent = useWebSocketStore((s) => s.onEvent);

  const [clientId] = React.useState(() => loadOrCreateClientId());
  const [acceptsCommands, setAcceptsCommandsState] = React.useState(() =>
    loadAcceptsCommands(),
  );

  const [activity] = React.useState(() => new CanvasAgentActivityStore());
  const [bus] = React.useState(() => new CanvasAgentBus({}));

  React.useEffect(() => {
    bus.setBridgeAccepting(acceptsCommands);
  }, [bus, acceptsCommands]);

  React.useEffect(() => {
    bus.setEditor(editor);
  }, [bus, editor]);

  React.useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    (async () => {
      try {
        await canvasAgentBridgeWsApi.register({
          client_id: clientId,
          label:
            typeof document !== "undefined" ? document.title || "Atmos Canvas" : "Atmos Canvas",
          accepts_commands: acceptsCommands,
          capabilities: ["canvas.v1"],
        });
      } catch (err) {
        if (!cancelled) {
          console.warn("[canvas-agent] failed to register bridge", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, acceptsCommands, isConnected]);

  const isConnectedRef = React.useRef(isConnected);
  React.useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  React.useEffect(() => {
    return () => {
      if (!isConnectedRef.current) return;
      canvasAgentBridgeWsApi.unregister(clientId).catch(() => {});
    };
  }, [clientId]);

  React.useEffect(() => {
    if (!isConnected) return;
    const unsubscribe = onEvent(DISPATCH_EVENT, (raw) => {
      const payload = raw as CanvasAgentDispatchInput | undefined;
      if (!payload || typeof payload.request_id !== "string") {
        return;
      }
      if (payload.client_id && payload.client_id !== clientId) {
        return;
      }

      void (async () => {
        const start = Date.now();
        const result = await bus.handleDispatch(payload);
        let createdShapeIds: string[] = [];
        if (result.success && result.data && typeof result.data === "object") {
          const data = result.data as Record<string, unknown>;
          if (typeof data.id === "string") {
            createdShapeIds = [data.id];
          } else if (Array.isArray(data.ids)) {
            createdShapeIds = data.ids.filter((v): v is string => typeof v === "string");
          }
        }
        if (result.success) {
          activity.record(payload.command, editor, createdShapeIds);
        }
        try {
          await canvasAgentBridgeWsApi.postResult({
            request_id: payload.request_id,
            success: result.success,
            error_code: result.success ? undefined : result.error_code,
            error_message: result.success ? undefined : result.error_message,
            recoverable: result.success ? undefined : result.recoverable,
            data: result.success ? result.data : result.data ?? null,
          });
        } catch (err) {
          console.warn(
            `[canvas-agent] failed to deliver result for ${payload.request_id}`,
            err,
          );
        }
        if (Date.now() - start > 1_000) {
          console.debug(
            `[canvas-agent] ${payload.command} took ${Date.now() - start}ms`,
          );
        }
      })();
    });
    return unsubscribe;
  }, [activity, bus, clientId, editor, isConnected, onEvent]);

  const setAcceptsCommands = React.useCallback((value: boolean) => {
    setAcceptsCommandsState(value);
    const instanceId = getActiveInstanceId();
    useUiPrefStore.getState().patchSlice(
      instanceId,
      "canvas",
      prev => ({ ...prev, acceptsCommands: value }),
      DEFAULT_CANVAS_PREFS,
    );
  }, []);

  return {
    clientId,
    acceptsCommands,
    isConnected,
    setAcceptsCommands,
    activity,
  };
}
