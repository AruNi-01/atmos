import type { RelayClientKind } from "./types";

function toWsOrigin(httpOrigin: string): string {
  return httpOrigin.replace(/^http/i, "ws");
}

/**
 * Build Relay client/terminal WS + HTTP gateway URLs (mirrors packages/relay Worker).
 * Useful when rehydrating a session from gateway_url alone (web disk hydrate).
 */
export function buildClientSessionUrls(opts: {
  relayOrigin: string;
  serverId: string;
  clientToken: string;
  clientKind: RelayClientKind;
}): {
  wsUrl: string;
  terminalWsUrl: string;
  gatewayUrl: string;
} {
  const origin = opts.relayOrigin.replace(/\/+$/, "");
  const wsBase = toWsOrigin(origin);
  const query = new URLSearchParams({
    server_id: opts.serverId,
    token: opts.clientToken,
    client_type: opts.clientKind,
  }).toString();

  return {
    gatewayUrl: `${origin}/v1/computers/${encodeURIComponent(opts.serverId)}/proxy`,
    terminalWsUrl: `${wsBase}/ws/terminal?${query}`,
    wsUrl: `${wsBase}/ws/client?${query}`,
  };
}

/**
 * Derive main client WSS URL from an HTTP gateway base
 * (`https://relay…/v1/computers/<id>/proxy` → `wss://…/ws/client?…`).
 */
export function clientWsUrlFromGateway(opts: {
  gatewayUrl: string;
  serverId: string;
  clientToken: string;
  clientKind: RelayClientKind;
}): string | null {
  let parsed: URL;
  try {
    parsed = new URL(opts.gatewayUrl);
  } catch {
    return null;
  }
  const origin = `${parsed.protocol}//${parsed.host}`;
  return buildClientSessionUrls({
    relayOrigin: origin,
    serverId: opts.serverId,
    clientToken: opts.clientToken,
    clientKind: opts.clientKind,
  }).wsUrl;
}
