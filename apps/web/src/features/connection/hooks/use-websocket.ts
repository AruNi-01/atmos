"use client";

import { create } from "zustand";
import type { WsAction } from "@atmos/api-types/ws/actions";
import type {
  WsError,
  WsMessage,
  WsNotification,
  WsRequest,
  WsResponse,
} from "@atmos/api-types/ws/frames";
import {
  createWsSession,
  DEFAULT_DESKTOP_CONNECT_WAIT_MS,
  DEFAULT_WEB_CONNECT_WAIT_MS,
  DEFAULT_WEB_RECONNECT,
  DEFAULT_WEB_REQUEST_TIMEOUT_MS,
  type ConnectionState as KernelState,
  type WsSession,
} from "@atmos/api-client/ws";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { syncClientSessionFromStore } from "@/features/connection/lib/sync-client-session";
import { ensureComputerClientSettingsHydrated } from "@/features/connection/lib/sync-computer-client-settings";
import { ensureLocalAppConnectionBootstrap } from "@/features/connection/lib/app-connection-bootstrap";
import {
  isDesktopRuntime,
  isHostedAtmosOrigin,
} from "@/shared/lib/desktop-runtime";
import { useConnectionStore } from "@/features/connection/store/connection-store";
import { buildWsUrl, buildWsUrlSync } from "@/shared/lib/ws-url";
import { debugLog } from "@/shared/lib/desktop-logger";

// Re-export wire types from the shared package (authoritative).
export type { WsAction } from "@atmos/api-types/ws/actions";
export type {
  WsError,
  WsMessage,
  WsNotification,
  WsRequest,
  WsResponse,
} from "@atmos/api-types/ws/frames";

// ===== WebSocket 状态管理 =====

type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

function mapKernelState(state: KernelState): ConnectionState {
  switch (state) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "idle":
    case "disconnected":
    case "closed":
    case "error":
    default:
      return "disconnected";
  }
}

interface WebSocketStore {
  connectionState: ConnectionState;
  /** @deprecated use session; kept for compatibility */
  socket: WebSocket | null;
  eventListeners: Map<string, Set<(data: unknown) => void>>;
  url: string;
  requestTimeout: number;
  maxReconnectAttempts: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  send: <T = unknown>(
    action: WsAction,
    data?: unknown,
    timeoutMs?: number,
  ) => Promise<T>;
  onEvent: (event: string, callback: (data: unknown) => void) => () => void;
}

const getWsUrl = (): string => buildWsUrlSync("/ws");

/** Shared in-flight connect; callers await the same handshake. */
let connectInFlight: Promise<void> | null = null;
/** Bumps on disconnect so in-flight bootstrap cannot reopen a socket. */
let connectGeneration = 0;
let session: WsSession | null = null;
let unsubState: (() => void) | null = null;
let unsubMessage: (() => void) | null = null;
let latestUrl = getWsUrl();

const defaultConnectionWaitMs = (): number =>
  isDesktopRuntime()
    ? DEFAULT_DESKTOP_CONNECT_WAIT_MS
    : DEFAULT_WEB_CONNECT_WAIT_MS;

/**
 * Ensure WebSocket is connected. Awaits bootstrap + handshake (not a blind poll).
 */
export async function waitForWebSocketConnection(
  timeoutMs = defaultConnectionWaitMs(),
): Promise<void> {
  if (useWebSocketStore.getState().connectionState === "connected") {
    return;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  const connectPromise = useWebSocketStore.getState().connect();
  // Ensure offline reconnect noise never becomes an unhandled rejection.
  void connectPromise.catch(() => undefined);

  const timeoutPromise = new Promise<void>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("WebSocket connection timeout"));
    }, timeoutMs);
  });

  try {
    await Promise.race([connectPromise, timeoutPromise]);
  } catch (err) {
    if (timedOut || useWebSocketStore.getState().connectionState !== "connected") {
      throw err instanceof Error ? err : new Error(String(err));
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (useWebSocketStore.getState().connectionState !== "connected") {
    throw new Error("WebSocket connection timeout");
  }
}

function ensureSession(): WsSession {
  if (session) return session;

  session = createWsSession({
    url: () => latestUrl,
    platform: {
      createWebSocket: (url) => new WebSocket(url) as unknown as import("@atmos/api-client/platform").WebSocketLike,
      log: (level, msg, meta) => {
        if (level === "error") {
          console.error("[WebSocket]", msg, meta ?? "");
        } else {
          debugLog(`ws:${msg} ${meta ? JSON.stringify(meta) : ""}`);
        }
      },
    },
    reconnect: DEFAULT_WEB_RECONNECT,
    requestTimeoutMs: DEFAULT_WEB_REQUEST_TIMEOUT_MS,
    connectWaitMs: defaultConnectionWaitMs(),
  });

  unsubState = session.onState((s) => {
    useWebSocketStore.setState({ connectionState: mapKernelState(s) });
  });

  unsubMessage = session.onMessage((parsed) => {
    if (!parsed || typeof parsed !== "object") return;
    const message = parsed as WsMessage;
    if (message.type !== "notification") return;
    const eventName = message.payload.event;
    const data = message.payload.data;
    if (eventName === "agent_hook_state_changed") {
      console.debug(
        "[WS] agent_hook_state_changed:",
        (data as Record<string, unknown>)?.tool,
        (data as Record<string, unknown>)?.state,
        "listeners:",
        useWebSocketStore.getState().eventListeners.get(eventName)?.size ?? 0,
      );
    }
    const listeners = useWebSocketStore.getState().eventListeners.get(eventName);
    listeners?.forEach((cb) => cb(data));
  });

  return session;
}

export const useWebSocketStore = create<WebSocketStore>((set, get) => ({
  connectionState: "disconnected",
  socket: null,
  eventListeners: new Map(),
  url: getWsUrl(),
  requestTimeout: DEFAULT_WEB_REQUEST_TIMEOUT_MS,
  maxReconnectAttempts: DEFAULT_WEB_RECONNECT.maxAttempts,

  connect: async () => {
    if (get().connectionState === "connected") {
      return;
    }
    if (connectInFlight) {
      return connectInFlight;
    }

    const generation = connectGeneration;
    const p = (async () => {
      if (get().connectionState === "connected") {
        return;
      }

      set({ connectionState: "connecting" });

      try {
        if (isHostedAtmosOrigin()) {
          await ensureComputerClientSettingsHydrated();
        } else {
          await ensureLocalAppConnectionBootstrap();
        }
        if (generation !== connectGeneration) {
          throw new Error("WebSocket connect cancelled");
        }
        useConnectionStore.getState().syncActiveInstanceFromComputer();
        const clientType = isDesktopRuntime() ? "desktop" : "web";
        const computer = useAtmosComputerStore.getState();
        let runtimeUrl: string;
        const relayUrl = computer.relayWebSocketUrl?.trim();
        if (computer.connectionMode === "relay" && relayUrl) {
          runtimeUrl = relayUrl.includes("client_type=")
            ? relayUrl
            : `${relayUrl}${relayUrl.includes("?") ? "&" : "?"}client_type=${encodeURIComponent(clientType)}`;
        } else {
          runtimeUrl = await buildWsUrl("/ws", { client_type: clientType });
        }
        if (generation !== connectGeneration) {
          throw new Error("WebSocket connect cancelled");
        }

        latestUrl = runtimeUrl;
        set({ url: runtimeUrl });

        debugLog(
          `ws:connect url=${runtimeUrl.replace(/token=[^&]+/, "token=<redacted>")}`,
        );
        console.log(
          "[WebSocket] Connecting to:",
          runtimeUrl.replace(/token=[^&]+/, "token=<redacted>"),
        );

        const s = ensureSession();
        await s.connect();
        if (generation !== connectGeneration) {
          s.disconnect();
          throw new Error("WebSocket connect cancelled");
        }
        void syncClientSessionFromStore().catch(() => undefined);
      } catch (error) {
        if (generation !== connectGeneration) {
          throw error instanceof Error ? error : new Error(String(error));
        }
        const msg = error instanceof Error ? error.message : String(error);
        debugLog(`ws:connect catch err=${msg}`);
        // Log message only — printing Error objects can fail bun tests as unhandled.
        console.error("[WebSocket] Connection failed:", msg);
        set({ connectionState: "disconnected", socket: null });
        // Kernel schedules reconnect when policy allows; ensure session exists
        ensureSession();
        throw error instanceof Error ? error : new Error(msg);
      }
    })();

    connectInFlight = p;
    void p.finally(() => {
      if (connectInFlight === p) {
        connectInFlight = null;
      }
    });
    // Prevent unhandled rejections when connect is kicked from offline settings writes.
    void p.catch(() => undefined);

    return p;
  },

  disconnect: () => {
    connectGeneration += 1;
    connectInFlight = null;
    session?.disconnect();
    set({
      socket: null,
      connectionState: "disconnected",
    });
  },

  send: <T = unknown>(
    action: WsAction,
    data: unknown = {},
    timeoutMs?: number,
  ): Promise<T> => {
    const s = ensureSession();
    return s.request<T>(action, data, { timeoutMs });
  },

  onEvent: (event: string, callback: (data: unknown) => void) => {
    const { eventListeners } = get();
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    eventListeners.get(event)!.add(callback);

    return () => {
      const listeners = get().eventListeners.get(event);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  },
}));

/**
 * 使用 WebSocket 连接的 Hook
 */
export function useWebSocket() {
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const connect = useWebSocketStore((s) => s.connect);
  const disconnect = useWebSocketStore((s) => s.disconnect);
  const send = useWebSocketStore((s) => s.send);

  return {
    connectionState,
    isConnected: connectionState === "connected",
    connect,
    disconnect,
    send,
  };
}

// silence unused unsub holders for HMR lifecycle (kept for future dispose)
void unsubState;
void unsubMessage;
