/**
 * Align CLI discovery with the active Web/Desktop session.
 *
 * Local mode: remove `~/.atmos/client-session.json` so CLI uses `runtime_manifest.json`.
 * Relay mode: write `client-session.json` with gateway URL + token for the selected Computer.
 */

import { useAtmosComputerStore } from '@/lib/atmos-computer-store';
import { getRuntimeApiConfig, httpBase, isTauriRuntime } from '@/lib/desktop-runtime';

async function putClientSession(
  body: Record<string, unknown>,
  apiBase: string,
): Promise<void> {
  const token =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_TOKEN : undefined;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/system/client-session`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn('[sync-client-session] PUT failed', res.status, text);
  }
}

/** Local session: CLI should read runtime_manifest, not a stale relay session file. */
export async function syncClientSessionLocal(): Promise<void> {
  if (isTauriRuntime()) {
    const internals = (
      window as {
        __TAURI_INTERNALS__?: { invoke?: (cmd: string) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__;
    if (internals?.invoke) {
      try {
        await internals.invoke('clear_client_session_cmd');
      } catch (e) {
        console.warn('[sync-client-session] desktop clear failed', e);
      }
    }
    return;
  }

  const cfg = await getRuntimeApiConfig();
  await putClientSession({ clear: true }, httpBase(cfg));
}

export async function syncClientSessionRelay(
  serverId: string,
  apiBaseUrl: string,
  gatewayToken: string,
): Promise<void> {
  const cfg = await getRuntimeApiConfig();
  const loopbackBase = httpBase(cfg);
  await putClientSession(
    {
      server_id: serverId,
      api_base_url: apiBaseUrl,
      gateway_token: gatewayToken,
    },
    loopbackBase,
  );
}

export async function syncClientSessionFromStore(): Promise<void> {
  const {
    connectionMode,
    relayWebSocketUrl,
    relayGatewayHttpBase,
    relayClientToken,
    selectedServerId,
  } = useAtmosComputerStore.getState();
  if (
    connectionMode === 'relay' &&
    relayWebSocketUrl &&
    relayGatewayHttpBase &&
    relayClientToken &&
    selectedServerId
  ) {
    await syncClientSessionRelay(
      selectedServerId,
      relayGatewayHttpBase,
      relayClientToken,
    );
  } else {
    await syncClientSessionLocal();
  }
}
