'use client';

import { bootstrapActiveInstance } from '@/hooks/use-connection-store';
import { useWebSocketStore } from '@/hooks/use-websocket';
import { useAtmosComputerStore } from '@/lib/atmos-computer-store';
import {
  setHostedRuntimeApiOverride,
  type ApiConfig,
} from '@/lib/desktop-runtime';
import {
  syncClientSessionLocal,
  syncClientSessionRelay,
} from '@/lib/sync-client-session';
import {
  writeHostedConnectionPreference,
  type HostedRemoteSession,
} from '@/lib/hosted-connection';

async function reconnectForCurrentTarget(): Promise<void> {
  useWebSocketStore.getState().disconnect();
  await bootstrapActiveInstance();
  await useWebSocketStore.getState().connect();
}

export async function activateHostedLocalConnection(config: ApiConfig): Promise<void> {
  const store = useAtmosComputerStore.getState();
  setHostedRuntimeApiOverride(config);
  store.resetRelaySession();
  store.setConnectionMode('local');
  writeHostedConnectionPreference('local');
  await syncClientSessionLocal().catch(() => undefined);
  await reconnectForCurrentTarget();
}

export async function activateHostedRemoteConnection(
  serverId: string,
  session: HostedRemoteSession,
): Promise<void> {
  const store = useAtmosComputerStore.getState();
  store.setSelectedServerId(serverId);
  store.setRelayWebSocketUrl(session.ws_url);
  store.setRelayGatewayHttpBase(session.gateway_url);
  store.setRelayClientToken(session.client_token);
  store.setConnectionMode('relay');
  writeHostedConnectionPreference('relay');
  void syncClientSessionRelay(serverId, session.gateway_url, session.client_token).catch(
    () => undefined,
  );
  await reconnectForCurrentTarget();
}
