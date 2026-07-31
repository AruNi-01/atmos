export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose:
    | ((ev: { code: number; reason: string; wasClean: boolean }) => void)
    | null;
  onerror: ((ev?: unknown) => void) | null;
};

export type PlatformTimers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
};

export type WsSessionPlatform = {
  createWebSocket(url: string): WebSocketLike;
  timers?: PlatformTimers;
  now?: () => number;
  log?: (
    level: "debug" | "warn" | "error",
    msg: string,
    meta?: Record<string, unknown>,
  ) => void;
};

export const WEBSOCKET_OPEN = 1;
