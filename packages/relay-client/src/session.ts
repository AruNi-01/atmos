import { RelayError } from "./errors";
import type { ClientSessionResponse } from "./types";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Derive terminal WS URL from main client WS when Relay omits `terminal_ws_url`. */
export function deriveTerminalWsUrl(wsUrl: unknown): string | null {
  if (!isNonEmptyString(wsUrl)) return null;

  try {
    const url = new URL(wsUrl);
    if (!url.pathname.endsWith("/ws/client")) return null;
    url.pathname = `${url.pathname.slice(0, -"/ws/client".length)}/ws/terminal`;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseClientSessionResponse(payload: unknown): ClientSessionResponse {
  if (!payload || typeof payload !== "object") {
    throw invalidClientSessionResponse();
  }

  const response = payload as Partial<ClientSessionResponse>;
  const terminalWsUrl = isNonEmptyString(response.terminal_ws_url)
    ? response.terminal_ws_url
    : deriveTerminalWsUrl(response.ws_url);

  if (
    !isNonEmptyString(response.client_token) ||
    typeof response.expires_at !== "number" ||
    !isNonEmptyString(response.ws_url) ||
    !isNonEmptyString(response.gateway_url) ||
    !isNonEmptyString(terminalWsUrl)
  ) {
    throw invalidClientSessionResponse();
  }

  return {
    client_token: response.client_token,
    expires_at: response.expires_at,
    ws_url: response.ws_url,
    gateway_url: response.gateway_url,
    terminal_ws_url: terminalWsUrl,
  };
}

function invalidClientSessionResponse() {
  return new RelayError(
    "Relay returned an invalid client session.",
    502,
    "invalid_client_session_response",
  );
}
