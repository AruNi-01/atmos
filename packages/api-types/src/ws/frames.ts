import type { WsAction } from "./actions";

/**
 * Canonical main-app WebSocket envelopes (Rust `WsMessage` tag/content shape).
 * Field optionality matches server wire: `apps/api/src/api/ws/message.rs`.
 */

export type WsRequest = {
  type: "request";
  payload: {
    request_id: string;
    action: WsAction | string;
    data?: unknown;
  };
};

export type WsResponse = {
  type: "response";
  payload: {
    request_id: string;
    success: boolean;
    data?: unknown;
  };
};

export type WsError = {
  type: "error";
  payload: {
    request_id: string;
    code: string;
    message: string;
  };
};

export type WsNotification = {
  type: "notification";
  payload: {
    event: string;
    data?: unknown;
  };
};

/** Request/response/error/notification only (MVP). Ping/pong/legacy message omitted. */
export type WsMessage = WsRequest | WsResponse | WsError | WsNotification;
