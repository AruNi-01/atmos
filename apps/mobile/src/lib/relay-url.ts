const DEFAULT_CONTROL_PLANE_URL = "https://relay.atmos.land";

export function getDefaultControlPlaneUrl() {
  return normalizeRelayUrl(process.env.EXPO_PUBLIC_RELAY_CONTROL_PLANE_URL ?? DEFAULT_CONTROL_PLANE_URL);
}

export function normalizeRelayUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_CONTROL_PLANE_URL;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export function redactUrl(value: string) {
  return value.replace(/([?&]token=)[^&]+/i, "$1<redacted>");
}
