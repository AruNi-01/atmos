import type { WsAction } from "@atmos/api-types/ws/actions";
import type { WsSessionPlatform } from "../platform/types";

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "closed"
  | "error";

export type ExhaustedBehavior =
  | { type: "stop" }
  | { type: "slow_retry"; delayMs: number };

export type ReconnectPolicy = {
  enabled: boolean;
  initialDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  exhausted: ExhaustedBehavior;
  reconnectOnCleanClose: boolean;
};

export type WsSessionOptions = {
  url: string | (() => string);
  platform: WsSessionPlatform;
  reconnect?: Partial<ReconnectPolicy>;
  /** 0 or undefined = no per-request timeout */
  requestTimeoutMs?: number;
  connectWaitMs?: number;
};

export type RequestWhenReadyOptions = {
  action: WsAction | string;
  data?: unknown;
  timeoutMs?: number;
  waitMs?: number;
  isValid: () => boolean;
};

export type { WsAction };
