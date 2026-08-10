export const DEFAULT_RELAY_URL = "https://relay.atmos.land";

/** Normalize user/env input to a stable Relay origin (no trailing slash). */
export function normalizeRelayUrl(value?: string | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_RELAY_URL;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

/** Redact token query params for logs. */
export function redactRelayUrl(value: string): string {
  return value.replace(/([?&]token=)[^&]+/gi, "$1<redacted>");
}
