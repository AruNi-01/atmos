/** Empty WS request body. Runtime still sends `{}`. */
export type WsEmpty = Record<string, never>;

export type WsSuccess = {
  success: boolean;
};

export type WsOk = {
  ok: boolean;
};
