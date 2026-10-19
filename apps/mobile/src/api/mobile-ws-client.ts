import type { AgentChatSnapshot } from "@atmos/api-types/ws/dto/agent-chat";
import type { MappedWsAction, WsContract } from "@atmos/api-types/ws/contract";
import {
  createWsSession,
  DEFAULT_MOBILE_HEARTBEAT_INTERVAL_MS,
  DEFAULT_MOBILE_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_MOBILE_RECONNECT,
  DEFAULT_MOBILE_REQUEST_TIMEOUT_MS,
  type ConnectionState as KernelState,
  type WsRequestCallOpts,
  type WsSession,
} from "@atmos/api-client/ws";
import type { WebSocketLike } from "@atmos/api-client/platform";
import { redactUrl } from "@/lib/relay-url";
import { preferredComputerWebSocket } from "@/api/url-session-websocket";
import {
  AgentChatCursorTracker,
  agentChatCursorFromMessage,
  agentChatResyncMessage,
  lastEventSeqFromSubscribe,
  parseRelayCtrl,
} from "@/api/mobile-ws-transport";

const MOBILE_HANDSHAKE_TIMEOUT_MS = 15_000;
const RELAY_RESUBSCRIBE_INITIAL_MS = 250;
const RELAY_RESUBSCRIBE_MAX_MS = 15_000;

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
  ping?: (onPong: (error?: Error) => void) => void;
};

type MobileWebSocketCtor = new (url: string) => MobileWebSocketLike;

type MobileTimer = ReturnType<typeof setTimeout>;

export type MobileWsState = "idle" | "connecting" | "open" | "reconnecting" | "closed" | "error";

type MobileWsClientOptions = {
  WebSocketCtor?: MobileWebSocketCtor;
  clearTimeout?: (timer: MobileTimer) => void;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maxReconnectAttempts?: number;
  reconnect?: boolean;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  requestTimeoutMs?: number;
  setTimeout?: (callback: () => void, delayMs: number) => MobileTimer;
};

function mapState(state: KernelState, reconnectEnabled: boolean): MobileWsState {
  switch (state) {
    case "connected":
      return "open";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "disconnected":
      return reconnectEnabled ? "reconnecting" : "closed";
    case "error":
      return "error";
    case "closed":
      return "closed";
    case "idle":
      return "idle";
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
    ping: raw.ping
      ? (onPong) => {
          raw.ping!(onPong);
        }
      : undefined,
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

function subscribePayload(data: unknown): { chatId: string; afterSequence: number | null } | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { chat_id?: unknown; after_sequence?: unknown };
  if (typeof record.chat_id !== "string" || record.chat_id.length === 0) return null;
  const after =
    typeof record.after_sequence === "number" && Number.isFinite(record.after_sequence)
      ? record.after_sequence
      : record.after_sequence == null
        ? 0
        : null;
  if (after == null) return { chatId: record.chat_id, afterSequence: 0 };
  return { chatId: record.chat_id, afterSequence: after };
}

/**
 * Mobile façade over `@atmos/api-client` WsSession (APP-049).
 * Preserves historical state names (`open`) and constructor options for tests.
 */
export class MobileWsClient {
  private session: WsSession;
  private stateListeners = new Set<(state: MobileWsState) => void>();
  private alertListeners = new Set<(alert: string | null) => void>();
  private messageUnsub: (() => void) | null = null;
  private stateUnsub: (() => void) | null = null;
  private currentState: MobileWsState = "idle";
  private lastFailureMessage = "";
  private currentAlert: string | null = null;
  private disposed = false;
  private foreground = true;
  private networkOnline = true;
  private readonly cursors = new AgentChatCursorTracker();
  private readonly setTimer: (callback: () => void, delayMs: number) => MobileTimer;
  private readonly clearTimer: (timer: MobileTimer) => void;
  private readonly reconnectEnabled: boolean;
  private resubscribeTimer: MobileTimer | null = null;
  private resubscribeAttempt = 0;
  private resubscribeNeeded = false;

  constructor(
    private readonly wsUrl: string,
    options: MobileWsClientOptions = {},
  ) {
    const WebSocketCtor = options.WebSocketCtor;
    this.setTimer = options.setTimeout ?? setTimeout;
    this.clearTimer = options.clearTimeout ?? clearTimeout;
    const maxAttempts = options.maxReconnectAttempts ?? DEFAULT_MOBILE_RECONNECT.maxAttempts;
    const reconnectEnabled = options.reconnect ?? true;
    this.reconnectEnabled = reconnectEnabled;

    this.session = createWsSession({
      url: wsUrl,
      handshakeTimeoutMs: MOBILE_HANDSHAKE_TIMEOUT_MS,
      platform: {
        createWebSocket: (url) =>
          adaptSocket(
            WebSocketCtor ? new WebSocketCtor(url) : preferredComputerWebSocket(url),
            (message) => {
              this.lastFailureMessage = message;
            },
          ),
        timers: {
          setTimeout: (fn, ms) => this.setTimer(fn, ms),
          clearTimeout: (id) => this.clearTimer(id as MobileTimer),
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
        initialDelayMs: options.reconnectInitialDelayMs ?? DEFAULT_MOBILE_RECONNECT.initialDelayMs,
        maxDelayMs: options.reconnectMaxDelayMs ?? DEFAULT_MOBILE_RECONNECT.maxDelayMs,
      },
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_MOBILE_REQUEST_TIMEOUT_MS,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? DEFAULT_MOBILE_HEARTBEAT_INTERVAL_MS,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs ?? DEFAULT_MOBILE_HEARTBEAT_TIMEOUT_MS,
    });

    this.stateUnsub = this.session.onState((s) => {
      if (s === "connected") {
        this.lastFailureMessage = "";
        if (this.currentAlert !== "No network connection.") this.setAlert(null);
      }
      this.currentState = mapState(s, this.reconnectEnabled);
      this.stateListeners.forEach((l) => l(this.currentState));
    });
    this.messageUnsub = this.session.onMessage((msg) => {
      this.handleTransportMessage(msg);
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

  get transportAlert() {
    return this.currentAlert;
  }

  connect() {
    if (this.disposed) return;
    if (this.currentState === "open") return;
    void this.session.connect().catch(() => undefined);
  }

  close() {
    this.disposed = true;
    this.clearResubscribeTimer();
    this.messageUnsub?.();
    this.stateUnsub?.();
    this.messageUnsub = null;
    this.stateUnsub = null;
    this.session.disconnect();
    this.currentState = "closed";
    this.stateListeners.forEach((l) => l(this.currentState));
  }

  setForeground(active: boolean) {
    this.foreground = active;
    this.applyLifecycle();
  }

  setNetworkOnline(online: boolean) {
    this.networkOnline = online;
    if (!online) this.setAlert("No network connection.");
    else if (this.currentAlert === "No network connection.") this.setAlert(null);
    this.applyLifecycle();
  }

  request<A extends MappedWsAction>(
    action: A,
    data?: WsContract[A]["input"],
    opts?: WsRequestCallOpts,
  ): Promise<WsContract[A]["output"]>;
  request(action: string, data?: unknown, opts?: WsRequestCallOpts): Promise<unknown> {
    if (action === "agent_chat_subscribe") {
      const payload = subscribePayload(data);
      if (payload) this.cursors.noteSubscribe(payload.chatId, payload.afterSequence);
    } else if (action === "agent_chat_unsubscribe") {
      const payload = subscribePayload(data);
      if (payload) this.cursors.noteUnsubscribe(payload.chatId);
    }
    return this.session.request(action as never, data as never, opts).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.lastFailureMessage = message;
      if (message.includes("not connected")) {
        return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      }
      return Promise.reject(err instanceof Error ? err : new Error(message));
    });
  }

  subscribeState(listener: (state: MobileWsState) => void) {
    this.stateListeners.add(listener);
    listener(this.currentState);
    return () => this.stateListeners.delete(listener);
  }

  subscribeAlerts(listener: (alert: string | null) => void) {
    this.alertListeners.add(listener);
    listener(this.currentAlert);
    return () => this.alertListeners.delete(listener);
  }

  subscribeMessages(listener: (message: unknown) => void) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private handleTransportMessage(message: unknown) {
    const cursor = agentChatCursorFromMessage(message);
    if (cursor) this.cursors.noteRevision(cursor.chatId, cursor.revision);

    const ctrl = parseRelayCtrl(message);
    if (!ctrl) return;
    this.lastFailureMessage = `relay_ctrl: ${ctrl.code}`;
    this.session.failPending(new Error(`relay_ctrl: ${ctrl.code}`));
    if (this.cursors.snapshots().length === 0) return;
    this.setAlert("Atmos Computer went offline. Catching up this chat.");
    this.scheduleResubscribe();
  }

  private lifecycleLive() {
    return this.foreground && this.networkOnline;
  }

  private scheduleResubscribe(immediate = false) {
    if (this.disposed) return;
    this.resubscribeNeeded = true;
    if (!this.lifecycleLive()) return;
    if (this.resubscribeTimer != null) return;
    const delay =
      immediate || this.resubscribeAttempt === 0
        ? 0
        : Math.min(
            RELAY_RESUBSCRIBE_INITIAL_MS * 2 ** (this.resubscribeAttempt - 1),
            RELAY_RESUBSCRIBE_MAX_MS,
          );
    this.resubscribeAttempt += 1;
    this.resubscribeTimer = this.setTimer(() => {
      this.resubscribeTimer = null;
      void this.resubscribeNow();
    }, delay);
  }

  private async resubscribeNow() {
    if (this.disposed || !this.lifecycleLive()) return;
    const chats = this.cursors.snapshots();
    if (chats.length === 0) {
      this.resubscribeNeeded = false;
      this.resubscribeAttempt = 0;
      if (this.currentAlert !== "No network connection.") this.setAlert(null);
      return;
    }
    if (this.currentState !== "open") {
      this.scheduleResubscribe();
      return;
    }
    try {
      await Promise.all(chats.map((chat) => this.resyncChat(chat)));
      this.resubscribeNeeded = false;
      this.resubscribeAttempt = 0;
      if (this.currentAlert !== "No network connection.") this.setAlert(null);
    } catch {
      this.scheduleResubscribe();
    }
  }

  private async resyncChat(chat: { chat_id: string; after_sequence: number }) {
    const subscribed = await this.session.request("agent_chat_subscribe", {
      chat_id: chat.chat_id,
      after_sequence: chat.after_sequence,
    });
    const lastSeq = lastEventSeqFromSubscribe(subscribed);
    if (lastSeq != null) this.cursors.noteRevision(chat.chat_id, lastSeq);
    if (lastSeq === chat.after_sequence) return;
    if (!this.lifecycleLive()) throw new Error("lifecycle paused");
    const snapshot = (await this.session.request("agent_chat_get", {
      chat_id: chat.chat_id,
    })) as AgentChatSnapshot;
    const snapshotSeq = snapshot.meta?.last_event_seq;
    if (typeof snapshotSeq === "number") this.cursors.noteRevision(chat.chat_id, snapshotSeq);
    const resync = agentChatResyncMessage(chat.chat_id, snapshot);
    this.messageListeners.forEach((listener) => listener(resync));
  }

  private applyLifecycle() {
    if (this.disposed) return;
    if (!this.lifecycleLive()) {
      this.clearResubscribeTimer();
      this.session.pauseReconnect();
      return;
    }
    this.session.resumeReconnect();
    if (this.resubscribeNeeded) this.scheduleResubscribe(true);
  }

  private setAlert(alert: string | null) {
    this.currentAlert = alert;
    this.alertListeners.forEach((listener) => listener(alert));
  }

  private clearResubscribeTimer() {
    if (this.resubscribeTimer == null) return;
    this.clearTimer(this.resubscribeTimer);
    this.resubscribeTimer = null;
  }
}
