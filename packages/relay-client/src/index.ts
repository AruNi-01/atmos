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
  encodeB64Std,
  encodeB64Url,
  encodeLengthPrefixed,
  frameAad,
  generateX25519KeyPair,
  isRelayFrameSocketUrl,
  isValidEphPk,
  openHttpResponseRecord,
  openRecord,
  parseRelayE2eeOffer,
  prepareRelayFrameSocket,
  relayE2eeCsprngAvailable,
  RELAY_E2EE_ALG,
  RELAY_E2EE_ALG_HEADER,
  RELAY_E2EE_EPH_PK_HEADER,
  RELAY_E2EE_HEADER,
  RELAY_E2EE_HKDF_INFO,
  RELAY_E2EE_REQUEST_ID_HEADER,
  RELAY_E2EE_VERSION,
  RELAY_E2EE_WS_ALG,
  RELAY_E2EE_WS_EPH,
  RELAY_E2EE_WS_FLAG,
  RelayFrameCodec,
  sealRecord,
  sealRecordWithNonce,
  type CreateGatewayFetchOptions,
  type RelayE2eeSessionBlock,
  type RelayFrameStream,
} from "./e2ee";
export { attachRelayFrameE2ee, wrapRelayE2eeSocket, type RelayE2eeSocketLike } from "./e2ee-ws";
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
