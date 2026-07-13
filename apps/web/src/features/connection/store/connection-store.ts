'use client';

import { create } from 'zustand';
import {
  instanceIdFromRelaySelection,
  parseConnectionInstanceId,
  type ConnectionInstanceId,
} from '@/features/connection/lib/connection-instance';
import {
  readActiveInstanceIdRaw,
  writeActiveInstanceIdRaw,
} from '@/shared/lib/browser-store';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';

interface ConnectionStoreState {
  activeInstanceId: ConnectionInstanceId;
  /** Bumped only on intentional Computer/target identity transitions (APP-035). */
  connectionEpoch: number;
  setActiveInstanceId: (id: ConnectionInstanceId) => void;
  bumpConnectionEpoch: () => number;
  syncActiveInstanceFromComputer: () => void;
}

export const useConnectionStore = create<ConnectionStoreState>((set, get) => ({
  activeInstanceId: parseConnectionInstanceId(
    typeof window !== 'undefined' ? readActiveInstanceIdRaw() : null,
  ),
  connectionEpoch: 0,

  setActiveInstanceId: id => {
    writeActiveInstanceIdRaw(id);
    set({ activeInstanceId: id });
  },

  bumpConnectionEpoch: () => {
    const next = get().connectionEpoch + 1;
    set({ connectionEpoch: next });
    return next;
  },

  syncActiveInstanceFromComputer: () => {
    const computer = useAtmosComputerStore.getState();
    const id = instanceIdFromRelaySelection(
      computer.connectionMode,
      computer.selectedServerId,
    );
    get().setActiveInstanceId(id);
  },
}));

export function getActiveInstanceId(): ConnectionInstanceId {
  return useConnectionStore.getState().activeInstanceId;
}

/** Sync and persist the active connection instance id. */
export function bootstrapActiveInstance(): ConnectionInstanceId {
  const conn = useConnectionStore.getState();
  conn.syncActiveInstanceFromComputer();
  return useConnectionStore.getState().activeInstanceId;
}
