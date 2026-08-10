'use client';

import type { ComputerRow } from '@atmos/relay-client';
import { LOCAL_INSTANCE_ID, type ConnectionInstanceId } from '@/features/connection/lib/connection-instance';
import { useUiPrefStore } from '@/shared/stores/use-ui-pref-store';

export type { ComputerRow };

export interface ConnectionUiPrefs {
  selectedServerId: string | null;
  computersCache: ComputerRow[];
  localComputerDisplayName: string;
  localServerId: string | null;
}

const DEFAULT_CONNECTION_PREFS: ConnectionUiPrefs = {
  selectedServerId: null,
  computersCache: [],
  localComputerDisplayName: '',
  localServerId: null,
};

export function readConnectionUiPrefs(
  instanceId: ConnectionInstanceId = LOCAL_INSTANCE_ID,
): ConnectionUiPrefs {
  return useUiPrefStore.getState().readSlice(instanceId, 'connection', DEFAULT_CONNECTION_PREFS);
}

export function writeConnectionUiPrefs(
  patch: Partial<ConnectionUiPrefs>,
  instanceId: ConnectionInstanceId = LOCAL_INSTANCE_ID,
): void {
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'connection',
    prev => ({ ...prev, ...patch }),
    DEFAULT_CONNECTION_PREFS,
  );
}
