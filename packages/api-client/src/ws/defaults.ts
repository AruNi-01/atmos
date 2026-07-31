import type { ReconnectPolicy } from "./types";

export const DEFAULT_WEB_RECONNECT: ReconnectPolicy = {
  enabled: true,
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  maxAttempts: 10,
  exhausted: { type: "slow_retry", delayMs: 60_000 },
  reconnectOnCleanClose: false,
};

export const DEFAULT_MOBILE_RECONNECT: ReconnectPolicy = {
  enabled: true,
  initialDelayMs: 500,
  maxDelayMs: 5_000,
  maxAttempts: 5,
  exhausted: { type: "stop" },
  reconnectOnCleanClose: false,
};

export const DEFAULT_WEB_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_WEB_CONNECT_WAIT_MS = 15_000;
export const DEFAULT_DESKTOP_CONNECT_WAIT_MS = 30_000;
