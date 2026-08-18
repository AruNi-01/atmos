/**
 * Desktop custom protocol used by OAuth callback pages in the system browser.
 * Button href: `atmos://open` — focuses the existing Atmos window.
 */

export const ATMOS_PROTOCOL = "atmos";
export const ATMOS_OPEN_HREF = "atmos://open";

export function isAtmosProtocolUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("atmos:") || trimmed.startsWith("ATMOS:")) return true;
  try {
    return new URL(trimmed).protocol.toLowerCase() === "atmos:";
  } catch {
    return false;
  }
}

/** First `atmos:` URL in process argv (Windows / Linux protocol launch). */
export function findAtmosUrlInArgv(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (typeof arg === "string" && isAtmosProtocolUrl(arg)) return arg;
  }
  return null;
}
