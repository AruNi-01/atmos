export type { TerminalClientMessage, TerminalServerMessage, TerminalSnapshot } from "@atmos/shared/terminal";
import type { TerminalClientMessage, TerminalServerMessage } from "@atmos/shared/terminal";

type TerminalWebSocketLike = {
  readyState: number;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
  close: () => void;
  send: (data: string) => void;
};

type TerminalWebSocketCtor = new (url: string) => TerminalWebSocketLike;

type TerminalTimer = ReturnType<typeof setTimeout>;

export type TerminalWsState = "idle" | "connecting" | "open" | "reconnecting" | "closed" | "error";

type TerminalWsClientOptions = {
  WebSocketCtor?: TerminalWebSocketCtor;
  clearTimeout?: (timer: TerminalTimer) => void;
  reconnect?: boolean;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  setTimeout?: (callback: () => void, delayMs: number) => TerminalTimer;
};

const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 500;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 5_000;
const WEBSOCKET_OPEN = 1;

export class TerminalWsClient {
  private socket: WebSocket | null = null;
  private closeListeners = new Set<() => void>();
  private errorListeners = new Set<(error: string) => void>();
  private listeners = new Set<(message: TerminalServerMessage) => void>();
  private openListeners = new Set<() => void>();
  private stateListeners = new Set<(state: TerminalWsState) => void>();
  private state: TerminalWsState = "idle";
  private reconnectAttempt = 0;
  private reconnectTimer: TerminalTimer | null = null;
  private shouldReconnect = true;

  private readonly WebSocketCtor: TerminalWebSocketCtor;
  private readonly clearTimer: (timer: TerminalTimer) => void;
  private readonly reconnect: boolean;
  private readonly reconnectInitialDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly setTimer: (callback: () => void, delayMs: number) => TerminalTimer;

  constructor(
    private readonly terminalWsUrl: string,
    options: TerminalWsClientOptions = {},
  ) {
    this.WebSocketCtor = options.WebSocketCtor ?? (WebSocket as unknown as TerminalWebSocketCtor);
    this.clearTimer = options.clearTimeout ?? clearTimeout;
    this.reconnect = options.reconnect ?? true;
    this.reconnectInitialDelayMs = options.reconnectInitialDelayMs ?? DEFAULT_RECONNECT_INITIAL_DELAY_MS;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
    this.setTimer = options.setTimeout ?? setTimeout;
  }

  connect() {
    if (this.socket) return;
    this.shouldReconnect = true;
    this.openSocket("connecting");
  }

  private openSocket(state: TerminalWsState) {
    this.clearReconnectTimer();
    this.setState(state);
    const socket = new this.WebSocketCtor(this.terminalWsUrl);
    this.socket = socket as WebSocket;
    this.socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState("open");
      this.openListeners.forEach((listener) => listener());
    };
    this.socket.onerror = () => {
      this.setState("error");
      this.errorListeners.forEach((listener) => listener("Terminal WebSocket failed"));
    };
    this.socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.closeListeners.forEach((listener) => listener());
      this.scheduleReconnect();
    };
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as TerminalServerMessage;
        // Attach/create failures are terminal for this connection: server already
        // exhausted retries and will close the socket. Auto-reconnect would loop
        // forever because onopen resets reconnectAttempt.
        if (message.type === "terminal_error") {
          this.shouldReconnect = false;
          this.clearReconnectTimer();
          this.setState("error");
          this.errorListeners.forEach((listener) => listener(message.error));
        }
        this.listeners.forEach((listener) => listener(message));
      } catch {
        this.errorListeners.forEach((listener) => listener("Invalid terminal message"));
      }
    };
  }

  send(message: TerminalClientMessage) {
    if (!this.socket || this.socket.readyState !== WEBSOCKET_OPEN) {
      throw new Error("Terminal WebSocket is not connected");
    }
    this.socket.send(JSON.stringify(message));
  }

  isOpen() {
    return this.socket?.readyState === WEBSOCKET_OPEN;
  }

  subscribe(listener: (message: TerminalServerMessage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onOpen(listener: () => void) {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  onClose(listener: () => void) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  onError(listener: (error: string) => void) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onState(listener: (state: TerminalWsState) => void) {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  close() {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = null;
    this.setState("closed");
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect || !this.reconnect) {
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

  private setState(state: TerminalWsState) {
    this.state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }
}
