/**
 * Pure browser runtime event gate + remap.
 * Used by BrowserSurfaceManager and unit tests — no Electron imports.
 */

export type BrowserRuntimePayload = Record<string, unknown>;

/**
 * Decide whether a Chromium window-open (target=_blank / window.open) should
 * become a product browser tab. Returns null for non-http(s) or empty URLs.
 */
export function openTabTargetFromWindowOpenUrl(
  rawUrl: string | null | undefined,
): string | null {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/** Build the desktop-browser:open-tab payload shape the web UI expects. */
export function buildOpenTabEventPayload(opts: {
  sessionId: string;
  pageUrl: string;
  targetUrl: string;
}): BrowserRuntimePayload {
  return {
    type: "atmos-browser:open-tab",
    sessionId: opts.sessionId,
    pageUrl: opts.pageUrl,
    targetUrl: opts.targetUrl,
  };
}

export function remapRuntimeEventName(eventType: string): string | null {
  switch (eventType) {
    case "atmos-browser:ready":
      return "desktop-browser:ready";
    case "atmos-browser:hover":
      return "desktop-browser:hover";
    case "atmos-browser:selected":
      return "desktop-browser:selected";
    case "atmos-browser:toolbar-action":
      return "desktop-browser:toolbar-action";
    case "atmos-browser:cleared":
      return "desktop-browser:cleared";
    case "atmos-browser:error":
      return "desktop-browser:error";
    case "atmos-browser:navigation-changed":
      return "desktop-browser:navigation-changed";
    case "atmos-browser:title-changed":
      return "desktop-browser:title-changed";
    case "atmos-browser:open-tab":
      return "desktop-browser:open-tab";
    case "atmos-browser:cursor-changed":
      return "desktop-browser:cursor-changed";
    case "atmos-browser:detached-changed":
      return "desktop-browser:detached-changed";
    default:
      return null;
  }
}

/**
 * Validate session + bridgeToken, strip token, remap event name.
 * Returns null when the event must be dropped (unknown session / bad token / unknown type).
 */
export function gateAndRemapRuntimeEvent(
  payload: unknown,
  expectedToken: string | null | undefined,
  knownSessionIds: ReadonlySet<string> | Iterable<string>,
): { channel: string; body: BrowserRuntimePayload } | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = { ...(payload as BrowserRuntimePayload) };
  const sessionId = String(obj.sessionId ?? obj.session_id ?? "");
  const bridgeToken = String(obj.bridgeToken ?? "");
  const eventType = String(obj.type ?? "");
  if (!sessionId) return null;

  const known =
    knownSessionIds instanceof Set
      ? knownSessionIds
      : new Set(knownSessionIds);
  if (!known.has(sessionId)) return null;
  if (!expectedToken || !bridgeToken || bridgeToken !== expectedToken) {
    return null;
  }
  delete obj.bridgeToken;

  const mapped = remapRuntimeEventName(eventType);
  if (!mapped) return null;
  return { channel: mapped, body: obj };
}
