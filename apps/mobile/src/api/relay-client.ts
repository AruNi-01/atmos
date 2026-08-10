import type {
  ClientSessionResponse,
  ComputerRow,
  RegisterTokenResponse,
} from "@/api/types";

export class RelayError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "RelayError";
  }
}

type RequestOptions = {
  /** Hub-minted device credential (Relay Bearer). */
  token?: string | null;
  body?: unknown;
  method?: "GET" | "POST" | "PATCH";
};

/**
 * Relay REST client (APP-056).
 * Auth is Hub device credential Bearer — no `/v1/tenants` register/rotate.
 */
export class RelayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly relaySecretKey: string = "",
  ) {}

  createRegisterToken(deviceCredential: string) {
    return this.request<RegisterTokenResponse>("/v1/register_tokens", {
      method: "POST",
      token: deviceCredential,
      body: {},
    });
  }

  async listComputers(deviceCredential: string) {
    const response = await this.request<{ computers: ComputerRow[] }>("/v1/computers", {
      token: deviceCredential,
    });
    return response.computers;
  }

  renameComputer(deviceCredential: string, serverId: string, displayName: string) {
    return this.request<{ ok: true; server_id: string; display_name: string }>(
      `/v1/computers/${encodeURIComponent(serverId)}`,
      {
        method: "PATCH",
        token: deviceCredential,
        body: { display_name: displayName },
      },
    );
  }

  revokeComputer(deviceCredential: string, serverId: string) {
    return this.request<{ ok: true }>(`/v1/computers/${encodeURIComponent(serverId)}/revoke`, {
      method: "POST",
      token: deviceCredential,
      body: {},
    });
  }

  async createClientSession(deviceCredential: string, serverId: string) {
    const response = await this.request<unknown>(
      `/v1/computers/${encodeURIComponent(serverId)}/client_sessions`,
      {
        method: "POST",
        token: deviceCredential,
        body: { client_kind: "mobile" },
      },
    );
    return parseClientSessionResponse(response);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(this.relaySecretKey.trim() ? { "X-Atmos-Relay-Secret": this.relaySecretKey.trim() } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      throw new RelayError(
        payload.message ?? payload.error ?? `Relay request failed with ${response.status}`,
        response.status,
        payload.error,
      );
    }

    return payload as T;
  }
}

function parseClientSessionResponse(payload: unknown): ClientSessionResponse {
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

function deriveTerminalWsUrl(wsUrl: unknown): string | null {
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function invalidClientSessionResponse() {
  return new RelayError(
    "Relay returned an invalid mobile client session.",
    502,
    "invalid_client_session_response",
  );
}
