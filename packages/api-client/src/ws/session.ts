import type {
  MappedWsAction,
  WsContract,
} from "@atmos/api-types/ws/contract";
import type {
  MappedWsEvent,
  WsEventPayload,
} from "@atmos/api-types/ws/event-contract";
import type { WsError, WsResponse } from "@atmos/api-types/ws/frames";
import {
  WEBSOCKET_OPEN,
  type WebSocketLike,
  type WsSessionPlatform,
} from "../platform/types";
import {
  backoffDelayMs,
  mergeReconnectPolicy,
  redactUrl,
} from "./reconnect";
import type {
  ConnectionState,
  ReconnectPolicy,
  MappedRequestWhenReadyOptions,
  WsRequestCallOpts,
  WsSessionOptions,
} from "./types";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: unknown | null;
};

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class WsSession {
  private socket: WebSocketLike | null = null;
  private pending = new Map<string, Pending>();
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private notificationListeners = new Map<
    string,
    Set<(data: unknown) => void>
  >();
  private messageListeners = new Set<(msg: unknown) => void>();
  private currentState: ConnectionState = "idle";
  private reconnectAttempt = 0;
  private reconnectTimer: unknown = null;
  private shouldReconnect = false;
  /** Only schedule auto-reconnect after a successful open (not failed first handshake). */
  private everConnected = false;
  private connectInFlight: Promise<void> | null = null;
  /** Settles the active connect()/openSocket generation (incl. disconnect). */
  private connectWaiters: {
    resolve: () => void;
    reject: (error: Error) => void;
    settled: boolean;
  } | null = null;
  private readonly platform: WsSessionPlatform;
  private readonly policy: ReconnectPolicy;
  private readonly requestTimeoutMs: number;
  private readonly connectWaitMs: number;
  private readonly urlOption: string | (() => string);
  private readonly timers: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (id: unknown) => void;
  };

  constructor(private readonly options: WsSessionOptions) {
    this.platform = options.platform;
    this.policy = mergeReconnectPolicy(options.reconnect);
    this.requestTimeoutMs = options.requestTimeoutMs ?? 0;
    this.connectWaitMs = options.connectWaitMs ?? 15_000;
    this.urlOption = options.url;
    this.timers = options.platform.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    };
  }

  get state(): ConnectionState {
    return this.currentState;
  }

  resolveUrl(): string {
    return typeof this.urlOption === "function"
      ? this.urlOption()
      : this.urlOption;
  }

  connect(): Promise<void> {
    if (this.currentState === "connected" && this.socket?.readyState === WEBSOCKET_OPEN) {
      return Promise.resolve();
    }
    // True single-flight only while the handshake is still unsettled.
    // After open/close settles waiters, allow a new connect even before promise.finally.
    if (this.connectInFlight && this.connectWaiters && !this.connectWaiters.settled) {
      return this.connectInFlight;
    }

    this.shouldReconnect = this.policy.enabled;
    const state: ConnectionState =
      this.currentState === "reconnecting" ? "reconnecting" : "connecting";

    this.connectInFlight = new Promise<void>((resolve, reject) => {
      this.connectWaiters = { resolve, reject, settled: false };
      try {
        this.beginOpenSocket(state);
      } catch (err) {
        this.failConnect(err instanceof Error ? err : new Error(String(err)));
      }
    }).finally(() => {
      this.connectInFlight = null;
      this.connectWaiters = null;
    });
    // Always attach a no-op catch so fire-and-forget reconnect / store callers
    // never leave unhandled rejections (awaiters still observe the rejection).
    void this.connectInFlight.catch(() => undefined);
    return this.connectInFlight;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.failConnect(new Error("WebSocket disconnected"));
    const sock = this.socket;
    this.socket = null;
    if (sock) {
      sock.onclose = null;
      sock.onerror = null;
      sock.onmessage = null;
      sock.onopen = null;
      try {
        sock.close(1000, "client disconnect");
      } catch {
        /* ignore */
      }
    }
    this.rejectAll(new Error("WebSocket disconnected"));
    this.setState("closed");
  }

  async waitUntilConnected(timeoutMs = this.connectWaitMs): Promise<void> {
    if (this.currentState === "connected" && this.socket?.readyState === WEBSOCKET_OPEN) {
      return;
    }
    let timeoutId: unknown = null;
    let timedOut = false;
    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutId = this.timers.setTimeout(() => {
        timedOut = true;
        reject(new Error("WebSocket connection timeout"));
      }, timeoutMs);
    });
    const connectPromise = this.connect().catch((err) => {
      if (timedOut) return;
      throw err;
    });
    try {
      await Promise.race([connectPromise, timeoutPromise]);
    } finally {
      if (timeoutId != null) this.timers.clearTimeout(timeoutId);
    }
    if (this.currentState !== "connected") {
      throw new Error("WebSocket connection timeout");
    }
  }

  private succeedConnect(): void {
    const w = this.connectWaiters;
    if (!w || w.settled) return;
    w.settled = true;
    w.resolve();
  }

  private failConnect(error: Error): void {
    const w = this.connectWaiters;
    if (!w || w.settled) return;
    w.settled = true;
    w.reject(error);
  }

  request<A extends MappedWsAction>(
    action: A,
    data?: WsContract[A]["input"],
    opts?: WsRequestCallOpts,
  ): Promise<WsContract[A]["output"]>;
  request(
    action: string,
    data: unknown = {},
    opts?: WsRequestCallOpts,
  ): Promise<unknown> {
    return this.sendRequest(action, data, opts);
  }

  requestUnchecked<T = unknown>(
    action: string,
    data: unknown = {},
    opts?: WsRequestCallOpts,
  ): Promise<T> {
    return this.sendRequest(action, data, opts);
  }

  requestWhenReady<A extends MappedWsAction>(
    opts: MappedRequestWhenReadyOptions<A>,
  ): Promise<WsContract[A]["output"]>;
  async requestWhenReady(opts: {
    action: string;
    data?: unknown;
    timeoutMs?: number;
    waitMs?: number;
    isValid: () => boolean;
  }): Promise<unknown> {
    if (!opts.isValid()) {
      throw new Error("Computer scope changed before WebSocket request");
    }
    if (
      this.currentState !== "connected" ||
      !this.socket ||
      this.socket.readyState !== WEBSOCKET_OPEN
    ) {
      await this.waitUntilConnected(opts.waitMs ?? this.connectWaitMs);
    }
    if (!opts.isValid()) {
      throw new Error("Computer scope changed while waiting for WebSocket");
    }
    return this.sendRequest(opts.action, opts.data ?? {}, {
      timeoutMs: opts.timeoutMs,
    });
  }

  private sendRequest<T>(
    action: string,
    data: unknown = {},
    opts?: WsRequestCallOpts,
  ): Promise<T> {
    if (
      this.currentState !== "connected" ||
      !this.socket ||
      this.socket.readyState !== WEBSOCKET_OPEN
    ) {
      return Promise.reject(new Error("WebSocket is not connected"));
    }

    const requestId = createRequestId();
    const message = {
      type: "request" as const,
      payload: {
        request_id: requestId,
        action,
        data,
      },
    };

    const timeoutMs = opts?.timeoutMs ?? this.requestTimeoutMs;

    return new Promise<T>((resolve, reject) => {
      let timeout: unknown | null = null;
      if (timeoutMs > 0) {
        timeout = this.timers.setTimeout(() => {
          this.pending.delete(requestId);
          reject(new Error(`WebSocket request timeout: ${action}`));
        }, timeoutMs);
      }
      this.pending.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      try {
        this.socket!.send(JSON.stringify(message));
      } catch (err) {
        this.clearPending(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  onState(cb: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(cb);
    cb(this.currentState);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  onNotification<E extends MappedWsEvent>(
    event: E,
    cb: (data: WsEventPayload<E>) => void,
  ): () => void;
  onNotification(event: string, cb: (data: unknown) => void): () => void;
  onNotification(event: string, cb: (data: unknown) => void): () => void {
    let set = this.notificationListeners.get(event);
    if (!set) {
      set = new Set();
      this.notificationListeners.set(event, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.notificationListeners.delete(event);
    };
  }

  onMessage(cb: (msg: unknown) => void): () => void {
    this.messageListeners.add(cb);
    return () => {
      this.messageListeners.delete(cb);
    };
  }

  private beginOpenSocket(state: ConnectionState): void {
    this.clearReconnectTimer();
    this.setState(state);

    const url = this.resolveUrl();
    this.log("debug", "ws connect", { url: redactUrl(url) });

    let socket: WebSocketLike;
    try {
      socket = this.platform.createWebSocket(url);
    } catch (err) {
      this.setState("error");
      this.failConnect(err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
      return;
    }

    const prev = this.socket;
    if (prev) {
      prev.onclose = null;
      try {
        prev.close(1000, "Replaced");
      } catch {
        /* ignore */
      }
    }
    this.socket = socket;

    // Fail handshake if the peer never opens (avoids hanging offline unit tests / offline settings).
    const handshakeTimeoutMs = Math.min(this.connectWaitMs, 3_000);
    const handshakeTimer = this.timers.setTimeout(() => {
      if (this.socket !== socket) return;
      if (this.currentState === "connected") return;
      try {
        socket.onclose = null;
        socket.close();
      } catch {
        /* ignore */
      }
      if (this.socket === socket) this.socket = null;
      this.failConnect(new Error("WebSocket connection timeout"));
      this.setState("error");
      this.scheduleReconnect();
    }, handshakeTimeoutMs);

    socket.onopen = () => {
      this.timers.clearTimeout(handshakeTimer);
      this.reconnectAttempt = 0;
      this.everConnected = true;
      this.setState("connected");
      this.succeedConnect();
    };

    socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    socket.onerror = () => {
      this.log("error", "ws error", { url: redactUrl(url) });
      this.rejectAll(new Error(`WebSocket error: ${redactUrl(url)}`));
      this.setState("error");
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    };

    socket.onclose = (event) => {
      this.timers.clearTimeout(handshakeTimer);
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.rejectAll(new Error("WebSocket closed"));
      const wasClean = Boolean(event?.wasClean);
      const shouldSchedule =
        this.everConnected &&
        this.shouldReconnect &&
        this.policy.enabled &&
        (this.policy.reconnectOnCleanClose || !wasClean);

      // Settle connect before scheduling reconnect so reconnect can open a new socket.
      this.failConnect(
        new Error(`WebSocket closed during connect (${event?.code ?? "?"})`),
      );

      if (shouldSchedule) {
        this.scheduleReconnect();
      } else if (this.currentState !== "closed") {
        this.setState("disconnected");
      }
    };
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || !this.policy.enabled) {
      this.setState("closed");
      return;
    }

    if (this.reconnectAttempt >= this.policy.maxAttempts) {
      if (this.policy.exhausted.type === "stop") {
        this.setState("closed");
        return;
      }
      // slow_retry forever: reset attempt counter after delay
      this.setState("disconnected");
      this.reconnectAttempt = 0;
      this.reconnectTimer = this.timers.setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.shouldReconnect) return;
        void this.connect().catch(() => undefined);
      }, this.policy.exhausted.delayMs);
      return;
    }

    const delay = backoffDelayMs(this.policy, this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.setState("reconnecting");
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.shouldReconnect) return;
      void this.connect().catch(() => undefined);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer == null) return;
    this.timers.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private handleMessage(raw: unknown): void {
    let parsed: unknown = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        this.log("warn", "ws non-json message");
        this.messageListeners.forEach((l) => l(raw));
        return;
      }
    }

    this.messageListeners.forEach((l) => l(parsed));

    if (!parsed || typeof parsed !== "object") return;
    const envelope = parsed as {
      type?: string;
      payload?: Record<string, unknown>;
    };

    if (envelope.type === "notification") {
      const event = String(envelope.payload?.event ?? "");
      const data = envelope.payload?.data;
      const set = this.notificationListeners.get(event);
      set?.forEach((cb) => cb(data));
      return;
    }

    if (envelope.type === "error") {
      const err = envelope as WsError;
      const requestId = err.payload?.request_id;
      if (requestId && this.pending.has(requestId)) {
        const code = err.payload.code;
        const message = err.payload.message;
        const failure = new Error(
          code ? `[${code}] ${message}` : message || "WS error",
        );
        this.clearPending(requestId, failure);
      }
      return;
    }

    if (envelope.type !== "response") return;

    const res = envelope as WsResponse;
    const requestId = res.payload?.request_id;
    if (!requestId || !this.pending.has(requestId)) return;

    if (res.payload.success === false) {
      this.clearPending(
        requestId,
        new Error("WS request failed"),
      );
      return;
    }

    const pending = this.pending.get(requestId)!;
    this.clearPending(requestId);
    pending.resolve(res.payload.data);
  }

  private clearPending(requestId: string, error?: Error): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    if (pending.timeout != null) {
      this.timers.clearTimeout(pending.timeout);
    }
    if (error) pending.reject(error);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      if (pending.timeout != null) {
        this.timers.clearTimeout(pending.timeout);
      }
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private setState(state: ConnectionState): void {
    this.currentState = state;
    this.stateListeners.forEach((l) => l(state));
  }

  private log(
    level: "debug" | "warn" | "error",
    msg: string,
    meta?: Record<string, unknown>,
  ): void {
    this.platform.log?.(level, msg, meta);
  }
}

export function createWsSession(options: WsSessionOptions): WsSession {
  return new WsSession(options);
}
