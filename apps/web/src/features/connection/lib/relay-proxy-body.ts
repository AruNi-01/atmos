/**
 * The loopback Relay proxy forwards whatever the edge returned.
 * Relay itself always speaks JSON. An HTML body is a challenge page in front of Relay.
 */

export function parseRelayJsonBody(body: string): unknown | null {
  const trimmed = body.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/** True when the text is an edge challenge page, not a Relay JSON error. */
export function responseNeverReachedRelay(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseRelayJsonBody(trimmed) === null;
  }
  return (
    trimmed.includes("<!DOCTYPE") || trimmed.includes("<html") || /just a moment/i.test(trimmed)
  );
}
