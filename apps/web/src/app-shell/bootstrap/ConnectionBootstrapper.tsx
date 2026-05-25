'use client';

import { useEffect, useRef } from 'react';
import {
  bootstrapActiveInstance,
  reloadActiveConnectionData as reloadActiveConnectionDataFromStore,
} from '@/features/connection/store/connection-store';
import { ensureLocalAppConnectionBootstrap } from '@/features/connection/lib/app-connection-bootstrap';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';
import { isHostedAtmosOrigin } from '@/shared/lib/desktop-runtime';
import { useHostedConnectionStore } from '@/features/connection/store/hosted-connection-store';
import {
  createHostedRemoteSession,
  detectHostedLocalServer,
  readHostedConnectionPreference,
} from '@/features/connection/lib/hosted-connection';
import {
  activateHostedLocalConnection,
  activateHostedRemoteConnection,
} from '@/features/connection/lib/hosted-connection-actions';

/**
 * Hydrates computer-client token, syncs active connection instance, restores UI prefs.
 *
 * Order matters:
 *   1. Local connection prefs from `localStorage` (`computers`, `selectedServerId`).
 *   2. Computer-client settings (access token / control-plane URL) from the loopback API.
 *   3. Relay session from `~/.atmos/client-session.json`: if present, flips
 *      `connectionMode` to `'relay'` *before* `bootstrapActiveInstance()` so the
 *      WebSocket layer picks the relay target on the very first connect.
 *   4. Bootstrap the active connection instance (which triggers the WS connect).
 */
export function ConnectionBootstrapper() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    void (async () => {
      const hosted = isHostedAtmosOrigin();
      useHostedConnectionStore.getState().initialize(hosted);
      useAtmosComputerStore.getState().hydrateLocalConnectionPrefs();

      if (hosted) {
        const hostedStore = useHostedConnectionStore.getState();
        hostedStore.startChecking();
        const preferredTarget = readHostedConnectionPreference();

        try {
          try {
            const local = await detectHostedLocalServer();
            hostedStore.setLocalAvailable(local.config, local.status);
            if (preferredTarget === 'local') {
              await activateHostedLocalConnection(local.config);
              hostedStore.setConnected('local');
              return;
            }
          } catch (err) {
            hostedStore.setLocalUnavailable(
              err instanceof Error ? err.message : 'Cannot reach Atmos Server on this computer.',
            );
          }

          const {
            accessToken,
            controlPlaneUrl,
            selectedServerId,
          } = useAtmosComputerStore.getState();

          if (
            preferredTarget === 'relay' &&
            accessToken.trim().length >= 32 &&
            selectedServerId?.trim()
          ) {
            try {
              const session = await createHostedRemoteSession(
                controlPlaneUrl,
                accessToken,
                selectedServerId,
              );
              await activateHostedRemoteConnection(selectedServerId, session);
              hostedStore.setConnected('relay');
              return;
            } catch (err) {
              hostedStore.setRemoteError(
                err instanceof Error ? err.message : 'Could not reconnect remote computer.',
              );
            }
          }
        } catch (err) {
          console.warn('[ConnectionBootstrapper] hosted bootstrap failed:', err);
        }

        hostedStore.setOnboarding();
        return;
      }

      await ensureLocalAppConnectionBootstrap();
    })();
  }, []);

  return null;
}

/** After relay/local switch: resync instance + editor prefs + WS. */
export async function onConnectionTargetChanged(): Promise<void> {
  await bootstrapActiveInstance();
}

/** After the new WS target is connected, reload business data from that Computer. */
export async function reloadActiveConnectionData(): Promise<void> {
  await reloadActiveConnectionDataFromStore();
}
