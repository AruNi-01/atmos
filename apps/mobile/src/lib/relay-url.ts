import {
  DEFAULT_RELAY_URL,
  normalizeRelayUrl as normalizeRelayUrlCore,
  redactRelayUrl,
} from "@atmos/relay-client";

export { DEFAULT_RELAY_URL, redactRelayUrl };

export function getDefaultRelayUrl() {
  return normalizeRelayUrlCore(
    process.env.EXPO_PUBLIC_RELAY_URL ??
      process.env.EXPO_PUBLIC_RELAY_RELAY_URL ??
      DEFAULT_RELAY_URL,
  );
}

export function normalizeRelayUrl(value: string) {
  return normalizeRelayUrlCore(value);
}
