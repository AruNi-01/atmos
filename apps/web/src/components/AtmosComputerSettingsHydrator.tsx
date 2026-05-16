'use client';

import { useEffect, useRef } from 'react';
import { ensureComputerClientSettingsHydrated } from '@/lib/sync-computer-client-settings';

/** Loads `~/.atmos/computer-client.json` into the store on app startup. */
export function AtmosComputerSettingsHydrator() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    void ensureComputerClientSettingsHydrated();
  }, []);
  return null;
}
