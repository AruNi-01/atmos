/**
 * Restore the relay connection state from `~/.atmos/client-session.json`
 * (managed by the local Atmos Server) on app cold start.
 *
 * Why: the in-memory Zustand store has no persistent storage for the relay
 * fields (`relayWebSocketUrl`, `relayGatewayHttpBase`, `relayClientToken`,
 * `selectedServerId`, `connectionMode='relay'`). Without rehydration, a page
 * reload silently drops back to `connectionMode='local'`, even though the
 * loopback API is still configured to proxy to the remote Computer.
 *
 * We derive `relayWebSocketUrl` from `api_base_url` (the gateway URL on the
 * relay), since both are issued by the control plane at session creation
 * time and the token is the same value (`gateway_token === client_token`).
 */

import { getRuntimeApiConfig, httpBase } from '@/shared/lib/desktop-runtime';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';
import { useConnectionStore } from '@/features/connection/hooks/use-connection-store';

interface ClientSession {
  version: number;
  server_id: string;
  api_base_url: string;
  gateway_token: string;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/** Rewrite `https://relay.atmos.land/v1/computers/<id>/proxy` to the WSS handshake URL. */
function deriveRelayWebSocketUrl(
  apiBaseUrl: string,
  serverId: string,
  token: string,
  clientType: 'web' | 'desktop',
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(apiBaseUrl);
  } catch {
    return null;
  }
  const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  const origin = `${wsProto}//${parsed.host}`;
  const params = new URLSearchParams({
    server_id: serverId,
    token,
    client_type: clientType,
  });
  return `${origin}/ws/client?${params.toString()}`;
}

export async function hydrateRelaySessionFromDisk(opts?: {
  clientType?: 'web' | 'desktop';
}): Promise<void> {
  const cfg = await getRuntimeApiConfig().catch(() => null);
  if (!cfg) {
    return;
  }
  const base = httpBase(cfg).replace(/\/$/, '');
  const token =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_TOKEN : undefined;
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  type Envelope = ApiEnvelope<{ path: string; session: ClientSession }>;
  let envelope: Envelope | null = null;
  try {
    const res = await fetch(`${base}/api/system/client-session`, {
      method: 'GET',
      headers,
    });
    if (res.status === 404) {
      return; // no session on disk → stay in local mode
    }
    if (!res.ok) {
      return;
    }
    envelope = (await res.json().catch(() => null)) as Envelope | null;
  } catch {
    return;
  }

  const session = envelope?.data?.session;
  if (
    !session ||
    !session.server_id ||
    !session.api_base_url ||
    !session.gateway_token
  ) {
    return;
  }

  const wsUrl = deriveRelayWebSocketUrl(
    session.api_base_url,
    session.server_id,
    session.gateway_token,
    opts?.clientType ?? 'web',
  );
  if (!wsUrl) {
    return;
  }

  const store = useAtmosComputerStore.getState();
  store.setSelectedServerId(session.server_id);
  store.setRelayWebSocketUrl(wsUrl);
  store.setRelayGatewayHttpBase(session.api_base_url);
  store.setRelayClientToken(session.gateway_token);
  store.setConnectionMode('relay');
  // Mirror onto the active connection instance so downstream code reading
  // `useConnectionStore` sees the relay target immediately.
  useConnectionStore.getState().syncActiveInstanceFromComputer();
}
