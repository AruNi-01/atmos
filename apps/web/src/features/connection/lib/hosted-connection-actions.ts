'use client';

import {
  prepareConnectionTargetChange,
  reloadActiveConnectionData,
} from '@/app-shell/bootstrap/connection-target-lifecycle';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';
import {
  applyRelaySessionTransport,
  resetRelaySessionForQuery,
} from '@/features/connection/lib/query-identity-lifecycle';
import {
  setHostedRuntimeApiOverride,
  type ApiConfig,
} from '@/shared/lib/desktop-runtime';
import {
  syncClientSessionLocal,
  syncClientSessionRelay,
} from '@/features/connection/lib/sync-client-session';
import {
  writeHostedConnectionPreference,
  type HostedRemoteSession,
} from '@/features/connection/lib/hosted-connection';

export async function reconnectForCurrentTarget(): Promise<void> {
  useWebSocketStore.getState().disconnect();
  await prepareConnectionTargetChange();
  // connect() rejects on cancel; waitFor ensures we only reload once connected.
  const { waitForWebSocketConnection } = await import(
    '@/features/connection/hooks/use-websocket'
  );
  await useWebSocketStore.getState().connect().catch(() => undefined);
  await waitForWebSocketConnection();
  await reloadActiveConnectionData();
}

export async function activateCurrentLocalConnection(): Promise<void> {
  await resetRelaySessionForQuery();
  useAtmosComputerStore.getState().setConnectionMode('local');
  writeHostedConnectionPreference('local');
  await syncClientSessionLocal().catch(() => undefined);
  await reconnectForCurrentTarget();
}

export async function activateHostedLocalConnection(config: ApiConfig): Promise<void> {
  setHostedRuntimeApiOverride(config);
  await activateCurrentLocalConnection();
}

export async function activateHostedRemoteConnection(
  serverId: string,
  session: HostedRemoteSession,
): Promise<void> {
  const store = useAtmosComputerStore.getState();
  if (store.localServerId?.trim() && serverId === store.localServerId.trim()) {
    await activateCurrentLocalConnection();
    return;
  }
  store.setSelectedServerId(serverId);
  await applyRelaySessionTransport({
    relayWebSocketUrl: session.ws_url,
    relayGatewayHttpBase: session.gateway_url,
    relayClientToken: session.client_token,
  });
  store.setConnectionMode('relay');
  writeHostedConnectionPreference('relay');
  void syncClientSessionRelay(serverId, session.gateway_url, session.client_token).catch(
    () => undefined,
  );
  await reconnectForCurrentTarget();
}
