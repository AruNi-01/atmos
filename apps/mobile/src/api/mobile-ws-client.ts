import type {
  MappedWsAction,
  WsContract,
} from "@atmos/api-types/ws/contract";
import {
  createWsSession,
  DEFAULT_MOBILE_RECONNECT,
  type ConnectionState as KernelState,
  type WsRequestCallOpts,
  type WsSession,
} from "@atmos/api-client/ws";
import type { WebSocketLike } from "@atmos/api-client/platform";
import { redactUrl } from "@/lib/relay-url";
import { preferredComputerWebSocket } from "@/api/url-session-websocket";

const MOBILE_HANDSHAKE_TIMEOUT_MS = 15_000;

type MobileSocketEvent = {
  code?: number;
  message?: string;
  reason?: string;
  wasClean?: boolean;
};

type MobileWebSocketLike = {
  readyState: number;
  onclose: ((event?: MobileSocketEvent) => void) | null;
  onerror: ((event?: MobileSocketEvent) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
  close: (code?: number, reason?: string) => void;
  send: (data: string) => void;
};

type MobileWebSocketCtor = new (url: string) => MobileWebSocketLike;

type MobileTimer = ReturnType<typeof setTimeout>;

export type MobileWsState =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

type MobileWsClientOptions = {
  WebSocketCtor?: MobileWebSocketCtor;
  clearTimeout?: (timer: MobileTimer) => void;
  maxReconnectAttempts?: number;
  reconnect?: boolean;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  setTimeout?: (callback: () => void, delayMs: number) => MobileTimer;
};

function mapState(state: KernelState): MobileWsState {
  switch (state) {
    case "connected":
      return "open";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "error":
      return "error";
    case "closed":
      return "closed";
    case "idle":
      return "idle";
    case "disconnected":
    default:
      return "closed";
  }
}

function socketFailureText(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const record = event as MobileSocketEvent;
  const raw =
    typeof record.message === "string" && record.message.length > 0
      ? record.message
      : typeof record.reason === "string"
        ? record.reason
        : "";
  return redactUrl(raw).replace(/\s+/g, " ").trim().slice(0, 180);
}

function adaptSocket(
  raw: MobileWebSocketLike,
  onFailure: (message: string) => void,
): WebSocketLike {
  return {
    get readyState() {
      return raw.readyState;
    },
    send: (data) => raw.send(data),
    close: (code, reason) => {
      raw.close(code, reason);
    },
    get onopen() {
      return raw.onopen as WebSocketLike["onopen"];
    },
    set onopen(fn) {
      raw.onopen = fn as MobileWebSocketLike["onopen"];
    },
    get onmessage() {
      return raw.onmessage as WebSocketLike["onmessage"];
    },
    set onmessage(fn) {
      raw.onmessage = fn as MobileWebSocketLike["onmessage"];
    },
    get onerror() {
      return raw.onerror as WebSocketLike["onerror"];
    },
    set onerror(fn) {
      if (!fn) {
        raw.onerror = null;
        return;
      }
      raw.onerror = (event) => {
        const detail = socketFailureText(event);
        if (detail) onFailure(detail);
        fn(event);
      };
    },
    get onclose() {
      return raw.onclose as unknown as WebSocketLike["onclose"];
    },
    set onclose(fn) {
      if (!fn) {
        raw.onclose = null;
        return;
      }
      raw.onclose = (event) => {
        const detail = socketFailureText(event);
        if (detail) onFailure(detail);
        fn({
          code: typeof event?.code === "number" ? event.code : 1006,
          reason: detail,
          wasClean: Boolean(event?.wasClean),
        });
      };
    },
  };
}

/**
 * Mobile façade over `@atmos/api-client` WsSession (APP-049).
 * Preserves historical state names (`open`) and constructor options for tests.
 */
export class MobileWsClient {
  private session: WsSession;
  private stateListeners = new Set<(state: MobileWsState) => void>();
  private messageUnsub: (() => void) | null = null;
  private stateUnsub: (() => void) | null = null;
  private currentState: MobileWsState = "idle";
  private lastFailureMessage = "";

  constructor(
    private readonly wsUrl: string,
    options: MobileWsClientOptions = {},
  ) {
    const WebSocketCtor = options.WebSocketCtor;
    const setTimer = options.setTimeout ?? setTimeout;
    const clearTimer = options.clearTimeout ?? clearTimeout;
    const maxAttempts =
      options.maxReconnectAttempts ?? DEFAULT_MOBILE_RECONNECT.maxAttempts;
    const reconnectEnabled = options.reconnect ?? true;

    this.session = createWsSession({
      url: wsUrl,
      handshakeTimeoutMs: MOBILE_HANDSHAKE_TIMEOUT_MS,
      platform: {
        createWebSocket: (url) =>
          adaptSocket(
            WebSocketCtor
              ? new WebSocketCtor(url)
              : preferredComputerWebSocket(url),
            (message) => {
              this.lastFailureMessage = message;
            },
          ),
        timers: {
          setTimeout: (fn, ms) => setTimer(fn, ms),
          clearTimeout: (id) => clearTimer(id as MobileTimer),
        },
        log: (level, msg) => {
          if (level === "error") {
            // console.error opens the dev red box. A dropped Computer socket
            // already shows the in-app disconnected state and then retries.
            console.warn(`[mobile-ws] ${msg} ${redactUrl(this.wsUrl)}`);
          }
        },
      },
      reconnect: {
        ...DEFAULT_MOBILE_RECONNECT,
        enabled: reconnectEnabled,
        maxAttempts,
        initialDelayMs:
          options.reconnectInitialDelayMs ??
          DEFAULT_MOBILE_RECONNECT.initialDelayMs,
        maxDelayMs:
          options.reconnectMaxDelayMs ?? DEFAULT_MOBILE_RECONNECT.maxDelayMs,
      },
      requestTimeoutMs: 0,
    });

    this.stateUnsub = this.session.onState((s) => {
      if (s === "connected") this.lastFailureMessage = "";
      this.currentState = mapState(s);
      this.stateListeners.forEach((l) => l(this.currentState));
    });
    this.messageUnsub = this.session.onMessage((msg) => {
      this.messageListeners.forEach((l) => l(msg));
    });
  }

  private messageListeners = new Set<(message: unknown) => void>();

  get state() {
    return this.currentState;
  }

  get lastFailure() {
    return this.lastFailureMessage;
  }

  connect() {
    if (this.currentState === "open") return;
    void this.session.connect().catch(() => undefined);
  }

  close() {
    this.session.disconnect();
    this.currentState = "closed";
    this.stateListeners.forEach((l) => l(this.currentState));
  }

  request<A extends MappedWsAction>(
    action: A,
    data?: WsContract[A]["input"],
    opts?: WsRequestCallOpts,
  ): Promise<WsContract[A]["output"]>;
  request(action: string, data?: unknown, opts?: WsRequestCallOpts): Promise<unknown> {
    return this.session.request(action as never, data as never, opts).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("not connected")) {
        return Promise.reject(
          new Error("Atmos mobile WebSocket is not connected"),
        );
      }
      return Promise.reject(err instanceof Error ? err : new Error(message));
    });
  }

  subscribeState(listener: (state: MobileWsState) => void) {
    this.stateListeners.add(listener);
    listener(this.currentState);
    return () => this.stateListeners.delete(listener);
  }

  subscribeMessages(listener: (message: unknown) => void) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }
}
