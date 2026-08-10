/** Relay control-plane wire DTOs (REST). */

/** Client that opens a Relay client session toward a Computer. */
export type RelayClientKind = "web" | "mobile" | "desktop";

export type ComputerRow = {
  server_id: string;
  display_name: string | null;
  revoked: number;
  created_at: number;
  last_seen_at: number | null;
  registration_meta: Record<string, unknown> | null;
  online: boolean;
};

export type ClientSessionResponse = {
  client_token: string;
  expires_at: number;
  ws_url: string;
  gateway_url: string;
  /** Present from current Relay; derived from `ws_url` when older deployments omit it. */
  terminal_ws_url: string;
};

export type RegisterTokenResponse = {
  register_token: string;
  expires_at: number;
  register_command: string;
};

export type RenameComputerResponse = {
  ok: true;
  server_id: string;
  display_name: string;
};

export type RevokeComputerResponse = {
  ok: true;
};
