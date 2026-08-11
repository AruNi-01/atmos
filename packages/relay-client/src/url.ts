export const DEFAULT_RELAY_URL = "https://relay.atmos.land";

/**
 * Strip trailing `/` without a quantified regex (CodeQL js/polynomial-redos).
 * Linear scan — safe on untrusted user/env input.
 */
export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47 /* / */) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

/** Normalize user/env input to a stable Relay origin (no trailing slash). */
export function normalizeRelayUrl(value?: string | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_RELAY_URL;

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return stripTrailingSlashes(withProtocol);
}

/** Redact token query params for logs. */
export function redactRelayUrl(value: string): string {
  return value.replace(/([?&]token=)[^&]+/gi, "$1<redacted>");
}
