/**
 * Pure preview runtime event gate + remap (Tauri parity).
 * Used by PreviewSurfaceManager and unit tests — no Electron imports.
 */

export type PreviewRuntimePayload = Record<string, unknown>;

export function remapRuntimeEventName(eventType: string): string | null {
  switch (eventType) {
    case "atmos-preview:ready":
      return "desktop-preview:ready";
    case "atmos-preview:hover":
      return "desktop-preview:hover";
    case "atmos-preview:selected":
      return "desktop-preview:selected";
    case "atmos-preview:toolbar-action":
      return "desktop-preview:toolbar-action";
    case "atmos-preview:cleared":
      return "desktop-preview:cleared";
    case "atmos-preview:error":
      return "desktop-preview:error";
    case "atmos-preview:navigation-changed":
      return "desktop-preview:navigation-changed";
    case "atmos-preview:title-changed":
      return "desktop-preview:title-changed";
    case "atmos-preview:open-tab":
      return "desktop-preview:open-tab";
    case "atmos-preview:cursor-changed":
      return "desktop-preview:cursor-changed";
    case "atmos-preview:detached-changed":
      return "desktop-preview:detached-changed";
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
): { channel: string; body: PreviewRuntimePayload } | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = { ...(payload as PreviewRuntimePayload) };
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
