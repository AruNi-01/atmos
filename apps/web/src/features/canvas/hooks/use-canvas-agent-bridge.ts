"use client";

import * as React from "react";
import type { Editor, TLShapeId } from "tldraw";

import { canvasAgentBridgeWsApi } from "@/api/ws-api";
import {
  DEFAULT_CANVAS_PREFS,
  resolveCanvasPrefsInstanceId,
} from "@/shared/stores/use-ui-pref-hooks";
import { useUiPrefStore } from "@/shared/stores/use-ui-pref-store";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { CanvasAgentBus, type CanvasAgentDispatchInput } from "../lib/canvas-agent-bus";
import { CanvasAgentActivityStore } from "../lib/canvas-agent-activity";
import { CanvasAgentFeedStore } from "../lib/canvas-agent-feed";
import {
  shapeIdsFromAgentResult,
  type CanvasAgentBounds,
} from "../lib/canvas-agent-view-bounds";
import { focusCanvasShapes } from "../lib/canvas-shape-focus";
import { useCanvasRuntimeStore } from "../store/canvas-runtime-store";

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

function loadAgentFollow(): boolean {
  if (typeof window === "undefined") return true;
  const instanceId = resolveCanvasPrefsInstanceId();
  const prefs = useUiPrefStore.getState().readSlice(instanceId, "canvas", DEFAULT_CANVAS_PREFS);
  return prefs.agentFollow !== false;
}

export interface CanvasAgentBridgeState {
  clientId: string;
  acceptsCommands: boolean;
  /**
   * Camera follows agent-touched shapes after each successful mutating dispatch.
   * Independent of bridge enable — only applies while the bridge is accepting work.
   */
  agentFollow: boolean;
  isConnected: boolean;
  setAcceptsCommands: (value: boolean) => void;
  setAgentFollow: (value: boolean) => void;
  activity: CanvasAgentActivityStore;
  feed: CanvasAgentFeedStore;
  /** Fail the in-flight CLI dispatch (e.g. after canvas crash recovery). */
  failInflight: (message: string) => Promise<void>;
}

export function useCanvasAgentBridge(
  editor: Editor | null,
  options?: { activeDocumentFileName?: string | null },
): CanvasAgentBridgeState {
  const activeDocumentFileName = options?.activeDocumentFileName ?? null;
  const isConnected = useWebSocketStore((s) => s.connectionState === "connected");
  const onEvent = useWebSocketStore((s) => s.onEvent);

  const [clientId] = React.useState(() => loadOrCreateClientId());
  const [acceptsCommands, setAcceptsCommandsState] = React.useState(() =>
    loadAcceptsCommands(),
  );
  const [agentFollow, setAgentFollowState] = React.useState(() => loadAgentFollow());

  const [activity] = React.useState(() => new CanvasAgentActivityStore());
  const [feed] = React.useState(() => new CanvasAgentFeedStore());
  // Stable ref so the bus can read the latest agent-view frame without re-creating.
  const activityRef = React.useRef(activity);
  activityRef.current = activity;
  const agentFollowRef = React.useRef(agentFollow);
  agentFollowRef.current = agentFollow;
  const [bus] = React.useState(
    () =>
      new CanvasAgentBus({
        getAgentViewBounds: () => activityRef.current.getViewState().viewBounds,
      }),
  );
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
          capabilities: ["canvas.v1", "canvas-documents.1"],
          active_document_file_name: activeDocumentFileName,
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
  }, [clientId, acceptsCommands, isConnected, activeDocumentFileName]);

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
        /** Captured in try, attached via finalizeRequest in finally (HMR-safe). */
        let screenshotForFeed:
          | { dataUrl: string; width: number; height: number }
          | undefined;
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
              // Follow agent-view frames when Follow is on (CLI --zoom is independent).
              if (agentFollowRef.current && editor && view.w > 0 && view.h > 0) {
                try {
                  editor.zoomToBounds(
                    { x: view.x, y: view.y, w: view.w, h: view.h },
                    { animation: { duration: 320 } },
                  );
                } catch {
                  // Editor may be mid-dispose.
                }
              }
            }
          } else if (success && normalized === "set-status") {
            const status = (result.data as { status?: string }).status;
            if (status === "idle" || status === "active") {
              activity.setStatus(status);
            }
          } else if (success && normalized === "screenshot" && result.data) {
            activity.record(payload.command, editor, touchedShapeIds);
            const shot = result.data as {
              data_url?: string;
              width?: number;
              height?: number;
            };
            if (typeof shot.data_url === "string" && shot.data_url.startsWith("data:")) {
              // Island thumb comes from the feed entry (finalizeRequest extras).
              screenshotForFeed = {
                dataUrl: shot.data_url,
                width: typeof shot.width === "number" ? shot.width : 0,
                height: typeof shot.height === "number" ? shot.height : 0,
              };
            }
          } else if (success) {
            activity.record(payload.command, editor, touchedShapeIds);
            // Pulse operated shapes (CanvasFocusPulse) and optionally follow camera.
            if (editor && touchedShapeIds.length > 0) {
              highlightAgentTouchedShapes(editor, touchedShapeIds, {
                followCamera: agentFollowRef.current,
              });
            }
          }
        } finally {
          activity.endWork();
          feed.finalizeRequest(
            payload.request_id,
            success,
            screenshotForFeed ? { screenshot: screenshotForFeed } : undefined,
          );
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

  const setAgentFollow = React.useCallback((value: boolean) => {
    setAgentFollowState(value);
    agentFollowRef.current = value;
    const instanceId = resolveCanvasPrefsInstanceId();
    useUiPrefStore.getState().patchSlice(
      instanceId,
      "canvas",
      prev => ({ ...prev, agentFollow: value }),
      DEFAULT_CANVAS_PREFS,
    );
  }, []);

  return {
    clientId,
    acceptsCommands,
    agentFollow,
    isConnected,
    setAcceptsCommands,
    setAgentFollow,
    activity,
    feed,
    failInflight,
  };
}

/**
 * Reuses the shared canvas focus pulse (same animation as pin-to-canvas /
 * terminal focus) so agent-touched shapes flash without stealing selection.
 * Camera follow is opt-in via Agent Follow.
 */
function highlightAgentTouchedShapes(
  editor: Editor,
  shapeIds: string[],
  options: { followCamera: boolean },
) {
  const ids = shapeIds.filter(Boolean) as TLShapeId[];
  if (ids.length === 0) return;
  focusCanvasShapes(editor, ids, {
    select: false,
    animateCamera: options.followCamera,
    getFocusPulseShapeIds: () => useCanvasRuntimeStore.getState().focusPulseShapeIds,
    setFocusPulseShapeIds: (next) =>
      useCanvasRuntimeStore.getState().setFocusPulseShapeIds(next),
  });
}
