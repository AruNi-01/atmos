import { gatewayBaseUrl } from "./http-gateway";

function wsOrigin(http: string): string {
  return http.replace(/^http/, "ws");
}

export function buildClientSessionUrls({
  clientKind,
  clientToken,
  relayOrigin,
  serverId,
}: {
  clientKind: string;
  clientToken: string;
  relayOrigin: string;
  serverId: string;
}) {
  const wsBase = wsOrigin(relayOrigin);
  const query = `server_id=${encodeURIComponent(serverId)}&token=${encodeURIComponent(
    clientToken,
  )}&client_type=${encodeURIComponent(clientKind)}`;

  return {
    gatewayUrl: gatewayBaseUrl(relayOrigin, serverId),
    terminalWsUrl: `${wsBase}/ws/terminal?${query}`,
    wsUrl: `${wsBase}/ws/client?${query}`,
  };
}
