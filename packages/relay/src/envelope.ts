/** Shared relay data-plane envelope (APP-016). */

export type RelayEnvelope = {
  v: number;
  stream?: string;
  kind: string;
  client_type?: string;
  from?: string;
  to?: string;
  request_id?: string;
  seq?: number;
  body?: string;
};
