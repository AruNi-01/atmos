import { gatewayBaseUrl } from "./http-gateway";

function wsOrigin(http: string): string {
  return http.replace(/^http/, "ws");
}

export function buildClientSessionUrls({
  clientKind,
  clientToken,
  controlPlaneOrigin,
  serverId,
}: {
  clientKind: string;
  clientToken: string;
  controlPlaneOrigin: string;
  serverId: string;
}) {
  const wsBase = wsOrigin(controlPlaneOrigin);
  const query = `server_id=${encodeURIComponent(serverId)}&token=${encodeURIComponent(
    clientToken,
  )}&client_type=${encodeURIComponent(clientKind)}`;

  return {
    gatewayUrl: gatewayBaseUrl(controlPlaneOrigin, serverId),
    terminalWsUrl: `${wsBase}/ws/terminal?${query}`,
    wsUrl: `${wsBase}/ws/client?${query}`,
  };
}
