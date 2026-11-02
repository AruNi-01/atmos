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
  /**
   * Opaque string. Encoding depends on stream/kind: standard-base64 bytes for
   * HTTP chunk frames; JSON text for HTTP start/error and system events; raw
   * text for app/terminal frames.
   */
  body?: string;
};
