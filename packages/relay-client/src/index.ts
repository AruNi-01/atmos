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
  createGatewayFetch,
  decodeB64Url,
  deriveRelayHttpE2eeKey,
  e2eeAad,
  encodeB64Url,
  encodeLengthPrefixed,
  generateX25519KeyPair,
  openRecord,
  parseRelayE2eeOffer,
  RELAY_E2EE_ALG,
  RELAY_E2EE_ALG_HEADER,
  RELAY_E2EE_EPH_PK_HEADER,
  RELAY_E2EE_HEADER,
  RELAY_E2EE_HKDF_INFO,
  RELAY_E2EE_REQUEST_ID_HEADER,
  RELAY_E2EE_VERSION,
  sealRecord,
  type CreateGatewayFetchOptions,
  type RelayE2eeSessionBlock,
} from "./e2ee";
export { deriveTerminalWsUrl, parseClientSessionResponse } from "./session";
export { buildClientSessionUrls, clientWsUrlFromGateway } from "./session-urls";
export {
  createFetchTransport,
  relayRequestJson,
  type RelayHttpMethod,
  type RelayTransport,
  type RelayTransportRequest,
  type RelayTransportResponse,
} from "./transport";
export { DEFAULT_RELAY_URL, normalizeRelayUrl, redactRelayUrl } from "./url";
export type {
  ClientSessionResponse,
  ComputerRow,
  RelayE2eeOffer,
  RelayE2eeSession,
  RegisterTokenResponse,
  RelayClientKind,
  RenameComputerResponse,
  RevokeComputerResponse,
} from "./types";
