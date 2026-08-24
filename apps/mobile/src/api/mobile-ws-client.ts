import type {
  MappedWsAction,
  WsContract,
} from "@atmos/api-types/ws/contract";
import {
  createWsSession,
  DEFAULT_MOBILE_RECONNECT,
  type ConnectionState as KernelState,
  type WsSession,
} from "@atmos/api-client/ws";
import type { WebSocketLike } from "@atmos/api-client/platform";
import { redactUrl } from "@/lib/relay-url";

type MobileWebSocketLike = {
  readyState: number;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
  close: () => void;
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

function adaptSocket(raw: MobileWebSocketLike): WebSocketLike {
  return {
    get readyState() {
      return raw.readyState;
    },
    send: (data) => raw.send(data),
    close: (code, reason) => {
      // Mobile fakes often ignore args
      void code;
      void reason;
      raw.close();
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
      raw.onerror = fn as MobileWebSocketLike["onerror"];
    },
    get onclose() {
      return raw.onclose as unknown as WebSocketLike["onclose"];
    },
    set onclose(fn) {
      if (!fn) {
        raw.onclose = null;
        return;
      }
      // Mobile CloseEvent often lacks wasClean; treat as unclean for reconnect
      raw.onclose = () => {
        fn({ code: 1006, reason: "", wasClean: false });
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

  constructor(
    private readonly wsUrl: string,
    options: MobileWsClientOptions = {},
  ) {
    const WebSocketCtor =
      options.WebSocketCtor ?? (WebSocket as unknown as MobileWebSocketCtor);
    const setTimer = options.setTimeout ?? setTimeout;
    const clearTimer = options.clearTimeout ?? clearTimeout;
    const maxAttempts =
      options.maxReconnectAttempts ?? DEFAULT_MOBILE_RECONNECT.maxAttempts;
    const reconnectEnabled = options.reconnect ?? true;

    this.session = createWsSession({
      url: wsUrl,
      platform: {
        createWebSocket: (url) =>
          adaptSocket(new WebSocketCtor(url) as MobileWebSocketLike),
        timers: {
          setTimeout: (fn, ms) => setTimer(fn, ms),
          clearTimeout: (id) => clearTimer(id as MobileTimer),
        },
        log: (level, msg) => {
          if (level === "error") {
            console.error(`[mobile-ws] ${msg} ${redactUrl(this.wsUrl)}`);
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
  ): Promise<WsContract[A]["output"]>;
  request(action: string, data?: unknown): Promise<unknown> {
    return this.session.request(action as never, data as never).catch((err) => {
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
