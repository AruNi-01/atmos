"use client";

import * as React from "react";
import type { Editor } from "tldraw";

import { canvasAgentBridgeWsApi } from "@/api/ws-api";
import { useWebSocketStore } from "@/hooks/use-websocket";
import { CanvasAgentBus, type CanvasAgentDispatchInput } from "./canvas-agent-bus";
import { CanvasAgentPresenceStore } from "./canvas-agent-presence";

const CLIENT_ID_STORAGE_KEY = "atmos.canvas.agent.clientId";
const ACCEPT_STORAGE_KEY = "atmos.canvas.agent.acceptsCommands";
const DISPATCH_EVENT = "canvas_agent_dispatch";

function loadOrCreateClientId(): string {
  if (typeof window === "undefined") return "ssr-client";
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // ignore quota / private mode errors
  }
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client-${Math.random().toString(36).slice(2, 10)}`;
  try {
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, generated);
  } catch {
    // ignore
  }
  return generated;
}

function loadAcceptsCommands(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ACCEPT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Bus factory pulled out of the render body so React state/refs are not read
 * during render.
 */
function createBus(presence: CanvasAgentPresenceStore): CanvasAgentBus {
  return new CanvasAgentBus({
    onActorActivity: (actor) => {
      presence.touch(actor, "(executing)");
    },
  });
}

export interface CanvasAgentBridgeState {
  clientId: string;
  acceptsCommands: boolean;
  isConnected: boolean;
  recentCommand: { command: string; actor_id?: string; ok: boolean } | null;
  setAcceptsCommands: (value: boolean) => void;
  presence: CanvasAgentPresenceStore;
}

export function useCanvasAgentBridge(editor: Editor | null): CanvasAgentBridgeState {
  const isConnected = useWebSocketStore((s) => s.connectionState === "connected");
  const onEvent = useWebSocketStore((s) => s.onEvent);

  const [clientId] = React.useState(() => loadOrCreateClientId());
  const [acceptsCommands, setAcceptsCommandsState] = React.useState(() =>
    loadAcceptsCommands(),
  );
  const [recentCommand, setRecentCommand] = React.useState<
    CanvasAgentBridgeState["recentCommand"]
  >(null);

  // Lazy-init singletons via useState initializers (run once).
  const [presence] = React.useState(() => new CanvasAgentPresenceStore());
  const [bus] = React.useState(() => createBus(presence));

  React.useEffect(() => {
    bus.setBridgeAccepting(acceptsCommands);
  }, [bus, acceptsCommands]);

  React.useEffect(() => {
    bus.setEditor(editor);
    presence.setEditor(editor);
    return () => {
      presence.setEditor(null);
    };
  }, [bus, presence, editor]);

  React.useEffect(() => {
    presence.start();
    return () => presence.stop();
  }, [presence]);

  // Register / refresh / unregister bridge entry whenever the relevant inputs
  // change. We re-send the registration after reconnects too.
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

  React.useEffect(() => {
    return () => {
      // Best-effort cleanup; ignore if socket is already closed.
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
        if (payload.actor?.actor_id && editor) {
          presence.recordResult(payload.actor.actor_id, editor, createdShapeIds);
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
        setRecentCommand({
          command: payload.command,
          actor_id: payload.actor?.actor_id,
          ok: result.success,
        });
        if (Date.now() - start > 1_000) {
          console.debug(
            `[canvas-agent] ${payload.command} took ${Date.now() - start}ms`,
          );
        }
      })();
    });
    return unsubscribe;
  }, [bus, clientId, editor, isConnected, onEvent, presence]);

  const setAcceptsCommands = React.useCallback((value: boolean) => {
    setAcceptsCommandsState(value);
    try {
      window.localStorage.setItem(ACCEPT_STORAGE_KEY, value ? "true" : "false");
    } catch {
      // ignore
    }
  }, []);

  return {
    clientId,
    acceptsCommands,
    isConnected,
    recentCommand,
    setAcceptsCommands,
    presence,
  };
}
