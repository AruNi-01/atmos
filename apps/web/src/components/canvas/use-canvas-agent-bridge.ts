"use client";

import * as React from "react";
import type { Editor } from "tldraw";

import { canvasAgentBridgeWsApi } from "@/api/ws-api";
import { resolveCanvasPrefsInstanceId } from "@/hooks/use-ui-pref-hooks";
import { useUiPrefStore } from "@/hooks/use-ui-pref-store";
import { useWebSocketStore } from "@/hooks/use-websocket";
import { CanvasAgentBus, type CanvasAgentDispatchInput } from "./canvas-agent-bus";
import { CanvasAgentActivityStore } from "./canvas-agent-activity";
import { CanvasAgentFeedStore } from "./canvas-agent-feed";
import {
  shapeIdsFromAgentResult,
  type CanvasAgentBounds,
} from "./canvas-agent-view-bounds";

const DEFAULT_CANVAS_PREFS = {
  sessionByBoard: {} as Record<string, unknown>,
  agentClientId: null as string | null,
  acceptsCommands: false,
};

const DISPATCH_EVENT = "canvas_agent_dispatch";

function loadOrCreateClientId(): string {
  if (typeof window === "undefined") return "ssr-client";
  const instanceId = resolveCanvasPrefsInstanceId();
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
  const instanceId = resolveCanvasPrefsInstanceId();
  return useUiPrefStore.getState().readSlice(instanceId, "canvas", DEFAULT_CANVAS_PREFS)
    .acceptsCommands;
}

export interface CanvasAgentBridgeState {
  clientId: string;
  acceptsCommands: boolean;
  isConnected: boolean;
  setAcceptsCommands: (value: boolean) => void;
  activity: CanvasAgentActivityStore;
  feed: CanvasAgentFeedStore;
  /** Fail the in-flight CLI dispatch (e.g. after canvas crash recovery). */
  failInflight: (message: string) => Promise<void>;
}

export function useCanvasAgentBridge(editor: Editor | null): CanvasAgentBridgeState {
  const isConnected = useWebSocketStore((s) => s.connectionState === "connected");
  const onEvent = useWebSocketStore((s) => s.onEvent);

  const [clientId] = React.useState(() => loadOrCreateClientId());
  const [acceptsCommands, setAcceptsCommandsState] = React.useState(() =>
    loadAcceptsCommands(),
  );

  const [activity] = React.useState(() => new CanvasAgentActivityStore());
  const [feed] = React.useState(() => new CanvasAgentFeedStore());
  const [bus] = React.useState(() => new CanvasAgentBus({}));
  const inflightRequestIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    bus.setBridgeAccepting(acceptsCommands);
    if (!acceptsCommands) {
      feed.clear();
    }
  }, [bus, acceptsCommands, feed]);

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
        inflightRequestIdRef.current = payload.request_id;
        activity.beginWork(editor, payload.command);
        feed.begin(payload.request_id, payload.command, payload.args ?? null);
        let result:
          | Awaited<ReturnType<CanvasAgentBus["handleDispatch"]>>
          | undefined;
        let success = false;
        try {
          try {
            result = await bus.handleDispatch(payload);
          } catch (err) {
            result = {
              success: false as const,
              error_code: "INTERNAL_ERROR" as const,
              error_message: err instanceof Error ? err.message : String(err),
              recoverable: true,
            };
          }
          success = result.success;
          const touchedShapeIds =
            success && result.data ? shapeIdsFromAgentResult(result.data) : [];
          const normalized = payload.command.trim().toLowerCase().replace(/_/g, "-");
          if (success && normalized === "set-agent-view" && result.data) {
            const view = (result.data as { view?: CanvasAgentBounds }).view;
            if (view) {
              activity.setAgentView(view, true);
            }
          } else if (success && normalized === "set-status") {
            const status = (result.data as { status?: string }).status;
            if (status === "idle" || status === "active") {
              activity.setStatus(status);
            }
          } else if (success) {
            activity.record(payload.command, editor, touchedShapeIds);
          }
        } finally {
          activity.endWork();
          feed.finalizeRequest(payload.request_id, success);
        }
        if (!result) return;

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
        if (inflightRequestIdRef.current === payload.request_id) {
          inflightRequestIdRef.current = null;
        }
      })();
    });
    return unsubscribe;
  }, [activity, bus, clientId, editor, feed, isConnected, onEvent]);

  const failInflight = React.useCallback(
    async (message: string) => {
      const requestId = inflightRequestIdRef.current;
      if (!requestId) return;
      activity.endWork();
      feed.finalizeRequest(requestId, false);
      try {
        if (isConnectedRef.current) {
          await canvasAgentBridgeWsApi.postResult({
            request_id: requestId,
            success: false,
            error_code: "INTERNAL_ERROR",
            error_message: message,
            recoverable: true,
            data: null,
          });
        }
      } catch (err) {
        console.warn("[canvas-agent] failed to post crash recovery result", err);
      } finally {
        inflightRequestIdRef.current = null;
      }
    },
    [feed],
  );

  const setAcceptsCommands = React.useCallback((value: boolean) => {
    setAcceptsCommandsState(value);
    const instanceId = resolveCanvasPrefsInstanceId();
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
    feed,
    failInflight,
  };
}
