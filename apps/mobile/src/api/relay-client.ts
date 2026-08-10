/**
 * Mobile re-export of shared Relay control-plane client.
 * Implementation: `@atmos/relay-client`.
 */
export {
  createRelayClient,
  DEFAULT_RELAY_URL,
  isPlausibleDeviceCredential,
  MIN_DEVICE_CREDENTIAL_LEN,
  normalizeRelayUrl,
  redactRelayUrl,
  RelayError,
  type ClientSessionResponse,
  type ComputerRow,
  type CreateClientSessionOptions,
  type RegisterTokenResponse,
  type RelayClient,
  type RelayClientConfig,
  type RelayClientKind,
} from "@atmos/relay-client";
