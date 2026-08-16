/**
 * True when the guest already shows `requestedUrl`.
 *
 * Tab hide/show must not treat that as a new navigation — remounting the
 * iframe/`<webview>` is the center-tab flash + full reload.
 *
 * Kept free of `browser-utils.tsx` so unit tests do not load UI.
 */
export function shouldReuseLoadedBrowserGuest(input: {
  currentUrl: string;
  requestedUrl: string;
}): boolean {
  const current = canonicalizeGuestUrl(input.currentUrl);
  const next = canonicalizeGuestUrl(input.requestedUrl);
  return Boolean(current && next && current === next);
}

function canonicalizeGuestUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
    ? trimmed
    : trimmed.startsWith("//")
      ? `https:${trimmed}`
      : `https://${trimmed}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return trimmed;
  }
}
