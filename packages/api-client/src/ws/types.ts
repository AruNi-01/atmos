import type { WsAction } from "@atmos/api-types/ws/actions";
import type {
  MappedWsAction,
  UnmappedWsAction,
  WsContract,
} from "@atmos/api-types/ws/contract";
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

export type WsRequestCallOpts = {
  timeoutMs?: number;
};

type ReadyBase = {
  timeoutMs?: number;
  waitMs?: number;
  isValid: () => boolean;
};

export type MappedRequestWhenReadyOptions<A extends MappedWsAction> = ReadyBase & {
  action: A;
  data?: WsContract[A]["input"];
};

export type RequestWhenReadyOptions<A extends MappedWsAction = MappedWsAction> =
  MappedRequestWhenReadyOptions<A>;

export type { MappedWsAction, UnmappedWsAction, WsAction, WsContract };
