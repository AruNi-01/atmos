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
  /**
   * Retry when the socket never reaches open. Web keeps this off so a bad
   * local URL does not spin; mobile turns it on because the first relay
   * upgrade is the one that fails on a phone.
   */
  reconnectBeforeOpen: boolean;
};

export type WsSessionOptions = {
  url: string | (() => string);
  platform: WsSessionPlatform;
  reconnect?: Partial<ReconnectPolicy>;
  /** 0 or undefined = no per-request timeout */
  requestTimeoutMs?: number;
  connectWaitMs?: number;
  /**
   * How long to wait for `onopen`. Omitted means `min(connectWaitMs, 3000)`,
   * which keeps offline unit tests short. Mobile sets this higher: the shared
   * cap was aborting a phone's relay upgrade before it could finish.
   */
  handshakeTimeoutMs?: number;
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
