/**
 * Align CLI discovery with the active Web/Desktop session.
 *
 * Local mode: clear `~/.atmos/local/state.json` so CLI uses `runtime_manifest.json`.
 * Relay mode: write relay hint into `local/state.json` (same legacy path).
 */

import { useAtmosComputerStore } from '@/lib/atmos-computer-store';
import { getRuntimeApiConfig, httpBase, isTauriRuntime } from '@/lib/desktop-runtime';

async function putClientState(
  body: Record<string, unknown>,
  apiBase: string,
): Promise<void> {
  const token =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_TOKEN : undefined;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/system/client-state`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn('[sync-client-session] PUT failed', res.status, text);
  }
}

/** Local session: CLI should read runtime_manifest, not a stale relay hint. */
export async function syncClientSessionLocal(): Promise<void> {
  if (isTauriRuntime()) {
    const internals = (
      window as {
        __TAURI_INTERNALS__?: { invoke?: (cmd: string) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__;
    if (internals?.invoke) {
      try {
        await internals.invoke('clear_client_state_cmd');
      } catch (e) {
        console.warn('[sync-client-session] desktop clear failed', e);
      }
    }
    return;
  }

  const cfg = await getRuntimeApiConfig();
  await putClientState({ clear: true }, httpBase(cfg));
}

export async function syncClientSessionRelay(
  serverId: string,
  gatewayUrl: string,
  clientToken: string,
): Promise<void> {
  const cfg = await getRuntimeApiConfig();
  const apiBase = httpBase(cfg);
  await putClientState(
    {
      connection_mode: 'relay',
      server_id: serverId,
      url: gatewayUrl,
      token: clientToken,
    },
    apiBase,
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
