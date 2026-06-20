import type { WsError, WsRequest, WsResponse } from "@/api/types";
import { redactUrl } from "@/lib/relay-url";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

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

export type MobileWsState = "idle" | "connecting" | "open" | "reconnecting" | "closed" | "error";

type MobileWsClientOptions = {
  WebSocketCtor?: MobileWebSocketCtor;
  clearTimeout?: (timer: MobileTimer) => void;
  maxReconnectAttempts?: number;
  reconnect?: boolean;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  setTimeout?: (callback: () => void, delayMs: number) => MobileTimer;
};

const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 500;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 5_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const WEBSOCKET_OPEN = 1;

export class MobileWsClient {
  private socket: MobileWebSocketLike | null = null;
  private pending = new Map<string, PendingRequest>();
  private stateListeners = new Set<(state: MobileWsState) => void>();
  private messageListeners = new Set<(message: unknown) => void>();
  private currentState: MobileWsState = "idle";
  private reconnectAttempt = 0;
  private reconnectTimer: MobileTimer | null = null;
  private shouldReconnect = true;

  private readonly WebSocketCtor: MobileWebSocketCtor;
  private readonly clearTimer: (timer: MobileTimer) => void;
  private readonly maxReconnectAttempts: number;
  private readonly reconnect: boolean;
  private readonly reconnectInitialDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly setTimer: (callback: () => void, delayMs: number) => MobileTimer;

  constructor(
    private readonly wsUrl: string,
    options: MobileWsClientOptions = {},
  ) {
    this.WebSocketCtor = options.WebSocketCtor ?? (WebSocket as unknown as MobileWebSocketCtor);
    this.clearTimer = options.clearTimeout ?? clearTimeout;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.reconnect = options.reconnect ?? true;
    this.reconnectInitialDelayMs = options.reconnectInitialDelayMs ?? DEFAULT_RECONNECT_INITIAL_DELAY_MS;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
    this.setTimer = options.setTimeout ?? setTimeout;
  }

  get state() {
    return this.currentState;
  }

  connect() {
    if (this.socket && this.currentState === "open") return;

    this.shouldReconnect = true;
    this.openSocket("connecting");
  }

  private openSocket(state: MobileWsState) {
    this.clearReconnectTimer();
    this.setState(state);
    const socket = new this.WebSocketCtor(this.wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState("open");
    };
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.rejectAll(new Error("Atmos mobile WebSocket closed"));
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      this.rejectAll(new Error(`Atmos mobile WebSocket error: ${redactUrl(this.wsUrl)}`));
      this.setState("error");
      socket.close();
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
  }

  close() {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = null;
    this.rejectAll(new Error("Atmos mobile WebSocket closed"));
    this.setState("closed");
  }

  request<T>(action: string, data?: unknown): Promise<T> {
    if (!this.socket || this.currentState !== "open" || this.socket.readyState !== WEBSOCKET_OPEN) {
      return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
    }

    const requestId = createRequestId();
    const message: WsRequest = {
      type: "request",
      payload: {
        request_id: requestId,
        action,
        data,
      },
    };

    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.socket?.send(JSON.stringify(message));
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

  private scheduleReconnect() {
    if (!this.shouldReconnect || !this.reconnect) {
      this.setState("closed");
      return;
    }

    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      this.setState("closed");
      return;
    }

    const delayMs = Math.min(
      this.reconnectInitialDelayMs * 2 ** this.reconnectAttempt,
      this.reconnectMaxDelayMs,
    );
    this.reconnectAttempt += 1;
    this.setState("reconnecting");
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      if (!this.shouldReconnect) return;
      this.openSocket("reconnecting");
    }, delayMs);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    this.clearTimer(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private handleMessage(raw: unknown) {
    const parsed = typeof raw === "string" ? safeJson(raw) : raw;
    this.messageListeners.forEach((listener) => listener(parsed));

    const envelope = parsed as WsResponse | WsError | null;
    if (envelope?.type === "error") {
      const error = envelope;
      const requestId = error.payload.request_id;
      const failure = new Error(error.payload.message);
      if (requestId && this.pending.has(requestId)) {
        this.pending.get(requestId)?.reject(failure);
        this.pending.delete(requestId);
      }
      return;
    }

    if (envelope?.type !== "response") return;

    const pending = this.pending.get(envelope.payload.request_id);
    if (!pending) return;

    this.pending.delete(envelope.payload.request_id);
    if (envelope.payload.success === false || envelope.payload.error) {
      pending.reject(new Error(envelope.payload.message ?? envelope.payload.error ?? "WS request failed"));
      return;
    }

    pending.resolve(envelope.payload.data);
  }

  private rejectAll(error: Error) {
    this.pending.forEach((pending) => pending.reject(error));
    this.pending.clear();
  }

  private setState(state: MobileWsState) {
    this.currentState = state;
    this.stateListeners.forEach((listener) => listener(state));
  }
}

function createRequestId() {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}
