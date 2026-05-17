'use client';

import { useEffect, useRef } from 'react';
import { ensureComputerClientSettingsHydrated } from '@/lib/sync-computer-client-settings';
import { bootstrapActiveInstance } from '@/hooks/use-connection-store';
import { useAtmosComputerStore } from '@/lib/atmos-computer-store';

/**
 * Hydrates computer-client token, syncs active connection instance, restores UI prefs.
 */
export function ConnectionBootstrapper() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    void (async () => {
      useAtmosComputerStore.getState().hydrateLocalConnectionPrefs();
      await ensureComputerClientSettingsHydrated();
      await bootstrapActiveInstance();
    })();
  }, []);

  return null;
}

/** After relay/local switch: resync instance + editor prefs + WS. */
export async function onConnectionTargetChanged(): Promise<void> {
  await bootstrapActiveInstance();
}
