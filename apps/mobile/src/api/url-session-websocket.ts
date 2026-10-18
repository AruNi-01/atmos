type SocketEvent = {
  code?: number;
  data?: string;
  message?: string;
  reason?: string;
  wasClean?: boolean;
};

type NativeSocket = {
  addListener(
    event: "open" | "message" | "error" | "close" | "pong",
    listener: (payload: SocketEvent) => void,
  ): { remove: () => void };
  close(code: number, reason: string): void;
  connect(url: string): void;
  ping?: () => void;
  release?: () => void;
  send(text: string): void;
};

type NativeSocketModule = {
  AtmosUrlSessionSocket: new () => NativeSocket;
};

export type PreferredWebSocket = {
  readyState: number;
  onclose: ((event?: SocketEvent) => void) | null;
  onerror: ((event?: SocketEvent) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
  close: (code?: number, reason?: string) => void;
  send: (data: string) => void;
  ping?: (onPong: (error?: Error) => void) => void;
};

const WEBSOCKET_CONNECTING = 0;
const WEBSOCKET_OPEN = 1;
const WEBSOCKET_CLOSED = 3;

function loadNativeModule(): NativeSocketModule | null {
  if (process.env.EXPO_OS !== "ios") return null;
  try {
    // Lazy so unit tests can import the socket wrapper without starting Expo.
    const expo = require("expo") as {
      requireNativeModule: <T>(name: string) => T;
    };
    return expo.requireNativeModule<NativeSocketModule>("AtmosUrlSessionSocket");
  } catch {
    return null;
  }
}

/**
 * iOS Computer/terminal socket. Falls back to the global WebSocket, which on
 * iOS is SocketRocket and does not share REST's Happy Eyeballs path.
 */
export function preferredComputerWebSocket(url: string): PreferredWebSocket {
  const native = loadNativeModule();
  if (native) return new UrlSessionWebSocket(url, native);
  return new WebSocket(url) as unknown as PreferredWebSocket;
}

export class UrlSessionWebSocket implements PreferredWebSocket {
  readyState = WEBSOCKET_CONNECTING;
  onclose: ((event?: SocketEvent) => void) | null = null;
  onerror: ((event?: SocketEvent) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;

  private readonly native: NativeSocket;
  private readonly subscriptions: Array<{ remove: () => void }>;
  private readonly pongWaiters: Array<(error?: Error) => void> = [];
  private connectCancelled = false;
  private released = false;

  constructor(url: string, module: NativeSocketModule) {
    this.native = new module.AtmosUrlSessionSocket();
    this.subscriptions = [
      this.native.addListener("open", () => {
        if (this.released) return;
        this.readyState = WEBSOCKET_OPEN;
        this.onopen?.();
      }),
      this.native.addListener("message", (payload) => {
        if (this.released) return;
        this.onmessage?.({ data: payload.data ?? "" });
      }),
      this.native.addListener("error", (payload) => {
        if (this.released) return;
        this.failPongWaiters(new Error(payload.message || payload.reason || "WebSocket error"));
        this.onerror?.(payload);
      }),
      this.native.addListener("pong", () => {
        if (this.released) return;
        const waiter = this.pongWaiters.shift();
        waiter?.();
      }),
      this.native.addListener("close", (payload) => {
        if (this.released) return;
        this.readyState = WEBSOCKET_CLOSED;
        this.failPongWaiters(new Error(payload.reason || payload.message || "WebSocket closed"));
        this.onclose?.(payload);
        this.release();
      }),
    ];
    // Match the browser WebSocket: the caller assigns handlers after `new`
    // returns, before the handshake is allowed to settle.
    queueMicrotask(() => {
      if (this.connectCancelled || this.released) return;
      this.native.connect(url);
    });
  }

  send(data: string) {
    if (this.readyState !== WEBSOCKET_OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.native.send(data);
  }

  ping(onPong: (error?: Error) => void) {
    if (this.readyState !== WEBSOCKET_OPEN) {
      onPong(new Error("WebSocket is not open"));
      return;
    }
    if (typeof this.native.ping !== "function") {
      onPong();
      return;
    }
    this.pongWaiters.push(onPong);
    this.native.ping();
  }

  close(code = 1000, reason = "") {
    this.connectCancelled = true;
    if (this.released) return;
    this.readyState = WEBSOCKET_CLOSED;
    this.native.close(code, reason);
  }

  private failPongWaiters(error: Error) {
    const waiters = this.pongWaiters.splice(0, this.pongWaiters.length);
    for (const waiter of waiters) waiter(error);
  }

  private release() {
    if (this.released) return;
    this.released = true;
    for (const subscription of this.subscriptions) subscription.remove();
    this.native.release?.();
  }
}
