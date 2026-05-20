'use client';

import { ensureComputerClientSettingsHydrated } from '@/lib/sync-computer-client-settings';
import { bootstrapActiveInstance } from '@/hooks/use-connection-store';
import { hydrateRelaySessionFromDisk } from '@/lib/hydrate-relay-session';
import { isHostedAtmosOrigin, isTauriRuntime } from '@/lib/desktop-runtime';

let localBootstrapPromise: Promise<void> | null = null;

/**
 * Local / desktop / browser-dev bootstrap: hydrate tokens, restore relay session,
 * sync editor prefs. Idempotent — safe to call from splash prefetch and WS connect.
 */
export function ensureLocalAppConnectionBootstrap(): Promise<void> {
  if (typeof window === 'undefined' || isHostedAtmosOrigin()) {
    return Promise.resolve();
  }

  if (!localBootstrapPromise) {
    localBootstrapPromise = (async () => {
      await ensureComputerClientSettingsHydrated();
      await hydrateRelaySessionFromDisk({
        clientType: isTauriRuntime() ? 'desktop' : 'web',
      });
      await bootstrapActiveInstance();
    })().catch((err) => {
      localBootstrapPromise = null;
      throw err;
    });
  }

  return localBootstrapPromise;
}
