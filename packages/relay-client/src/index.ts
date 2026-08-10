/**
 * @atmos/relay-client — Atmos Relay control-plane REST client.
 * Use @atmos/hub-client for Hub identity; @atmos/api-client for main /ws.
 */

export {
  createRelayClient,
  RELAY_SECRET_HEADER,
  type AuthenticatedRelayClient,
  type CreateClientSessionOptions,
  type RelayClient,
  type RelayClientConfig,
} from "./client";
export { activeComputers, onlineComputers } from "./computers";
export {
  isPlausibleDeviceCredential,
  MIN_DEVICE_CREDENTIAL_LEN,
  requireDeviceCredential,
} from "./credential";
export { RelayError, relayErrorFromBody } from "./errors";
export {
  deriveTerminalWsUrl,
  parseClientSessionResponse,
} from "./session";
export {
  buildClientSessionUrls,
  clientWsUrlFromGateway,
} from "./session-urls";
export {
  createFetchTransport,
  relayRequestJson,
  type RelayHttpMethod,
  type RelayTransport,
  type RelayTransportRequest,
  type RelayTransportResponse,
} from "./transport";
export {
  DEFAULT_RELAY_URL,
  normalizeRelayUrl,
  redactRelayUrl,
} from "./url";
export type {
  ClientSessionResponse,
  ComputerRow,
  RegisterTokenResponse,
  RelayClientKind,
  RenameComputerResponse,
  RevokeComputerResponse,
} from "./types";
