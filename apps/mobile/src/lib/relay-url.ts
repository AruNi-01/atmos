const DEFAULT_RELAY_URL = "https://relay.atmos.land";

export function getDefaultRelayUrl() {
  return normalizeRelayUrl(process.env.EXPO_PUBLIC_RELAY_RELAY_URL ?? DEFAULT_RELAY_URL);
}

export function normalizeRelayUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_RELAY_URL;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export function redactUrl(value: string) {
  return value.replace(/([?&]token=)[^&]+/i, "$1<redacted>");
}
