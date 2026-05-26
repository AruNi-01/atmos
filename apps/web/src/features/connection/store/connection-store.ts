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
  setActiveInstanceId: (id: ConnectionInstanceId) => void;
  syncActiveInstanceFromComputer: () => void;
}

export const useConnectionStore = create<ConnectionStoreState>((set, get) => ({
  activeInstanceId: parseConnectionInstanceId(
    typeof window !== 'undefined' ? readActiveInstanceIdRaw() : null,
  ),

  setActiveInstanceId: id => {
    writeActiveInstanceIdRaw(id);
    set({ activeInstanceId: id });
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
