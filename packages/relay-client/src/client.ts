import { requireDeviceCredential } from "./credential";
import { parseClientSessionResponse } from "./session";
import {
  createFetchTransport,
  relayRequestJson,
  type RelayHttpMethod,
  type RelayTransport,
} from "./transport";
import type {
  ClientSessionResponse,
  ComputerRow,
  RegisterTokenResponse,
  RelayClientKind,
  RenameComputerResponse,
  RevokeComputerResponse,
} from "./types";
import { normalizeRelayUrl } from "./url";

export const RELAY_SECRET_HEADER = "X-Atmos-Relay-Secret";

export type RelayClientConfig = {
  /** Relay origin, e.g. https://relay.atmos.land */
  baseUrl: string;
  /** Self-hosted Worker gate (optional). */
  relaySecretKey?: string;
  /** Override HTTP (desktop loopback proxy, tests, …). */
  transport?: RelayTransport;
};

export type CreateClientSessionOptions = {
  clientKind: RelayClientKind;
};

/** Methods that already carry a device credential. */
export type AuthenticatedRelayClient = {
  readonly baseUrl: string;
  readonly deviceCredential: string;
  listComputers(): Promise<ComputerRow[]>;
  renameComputer(
    serverId: string,
    displayName: string,
  ): Promise<RenameComputerResponse>;
  revokeComputer(serverId: string): Promise<RevokeComputerResponse>;
  createRegisterToken(): Promise<RegisterTokenResponse>;
  createClientSession(
    serverId: string,
    options: CreateClientSessionOptions,
  ): Promise<ClientSessionResponse>;
};

export type RelayClient = {
  readonly baseUrl: string;
  listComputers(deviceCredential: string): Promise<ComputerRow[]>;
  renameComputer(
    deviceCredential: string,
    serverId: string,
    displayName: string,
  ): Promise<RenameComputerResponse>;
  revokeComputer(
    deviceCredential: string,
    serverId: string,
  ): Promise<RevokeComputerResponse>;
  createRegisterToken(deviceCredential: string): Promise<RegisterTokenResponse>;
  createClientSession(
    deviceCredential: string,
    serverId: string,
    options: CreateClientSessionOptions,
  ): Promise<ClientSessionResponse>;
  /** Bind a Hub device credential so callers stop threading it on every method. */
  withDeviceCredential(deviceCredential: string): AuthenticatedRelayClient;
};

/**
 * Shared Relay control-plane client for web / mobile / desktop.
 * Auth: Hub device credential Bearer on every call.
 */
export function createRelayClient(config: RelayClientConfig): RelayClient {
  const baseUrl = normalizeRelayUrl(config.baseUrl);
  const relaySecretKey = (config.relaySecretKey ?? "").trim();
  const transport = config.transport ?? createFetchTransport();

  async function request<T>(
    path: string,
    opts: {
      deviceCredential: string;
      method?: RelayHttpMethod;
      body?: unknown;
    },
  ): Promise<T> {
    const token = requireDeviceCredential(opts.deviceCredential);
    const method = opts.method ?? "GET";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(relaySecretKey ? { [RELAY_SECRET_HEADER]: relaySecretKey } : {}),
    };
    const body =
      opts.body === undefined ? undefined : JSON.stringify(opts.body);

    return relayRequestJson<T>(transport, {
      baseUrl,
      path,
      method,
      headers,
      body,
    });
  }

  const client: RelayClient = {
    baseUrl,

    async listComputers(deviceCredential) {
      const response = await request<{ computers?: ComputerRow[] }>("/v1/computers", {
        deviceCredential,
      });
      return response.computers ?? [];
    },

    renameComputer(deviceCredential, serverId, displayName) {
      return request<RenameComputerResponse>(
        `/v1/computers/${encodeURIComponent(serverId)}`,
        {
          deviceCredential,
          method: "PATCH",
          body: { display_name: displayName },
        },
      );
    },

    revokeComputer(deviceCredential, serverId) {
      return request<RevokeComputerResponse>(
        `/v1/computers/${encodeURIComponent(serverId)}/revoke`,
        {
          deviceCredential,
          method: "POST",
          body: {},
        },
      );
    },

    createRegisterToken(deviceCredential) {
      return request<RegisterTokenResponse>("/v1/register_tokens", {
        deviceCredential,
        method: "POST",
        body: {},
      });
    },

    async createClientSession(deviceCredential, serverId, options) {
      const raw = await request<unknown>(
        `/v1/computers/${encodeURIComponent(serverId)}/client_sessions`,
        {
          deviceCredential,
          method: "POST",
          body: { client_kind: options.clientKind },
        },
      );
      return parseClientSessionResponse(raw);
    },

    withDeviceCredential(deviceCredential) {
      const token = requireDeviceCredential(deviceCredential);
      return {
        baseUrl,
        deviceCredential: token,
        listComputers: () => client.listComputers(token),
        renameComputer: (serverId, displayName) =>
          client.renameComputer(token, serverId, displayName),
        revokeComputer: (serverId) => client.revokeComputer(token, serverId),
        createRegisterToken: () => client.createRegisterToken(token),
        createClientSession: (serverId, options) =>
          client.createClientSession(token, serverId, options),
      };
    },
  };

  return client;
}
