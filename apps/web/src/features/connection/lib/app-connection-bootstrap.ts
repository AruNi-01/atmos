'use client';

import { ensureComputerClientSettingsHydrated } from '@/features/connection/lib/sync-computer-client-settings';
import { bootstrapActiveInstance } from '@/features/connection/store/connection-store';
import { hydrateRelaySessionFromDisk } from '@/features/connection/lib/hydrate-relay-session';
import { isHostedAtmosOrigin, isTauriRuntime } from '@/shared/lib/desktop-runtime';

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
