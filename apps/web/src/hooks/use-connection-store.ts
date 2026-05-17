'use client';

import { create } from 'zustand';
import {
  instanceIdFromRelaySelection,
  parseConnectionInstanceId,
  type ConnectionInstanceId,
} from '@/lib/connection-instance';
import {
  readActiveInstanceIdRaw,
  writeActiveInstanceIdRaw,
} from '@/lib/browser-store';
import { useAtmosComputerStore } from '@/lib/atmos-computer-store';
import { useFunctionSettingsStore } from '@/hooks/use-function-settings-store';
import { restoreEditorFromInstancePrefs } from '@/lib/restore-editor-from-prefs';

interface ConnectionStoreState {
  activeInstanceId: ConnectionInstanceId;
  setActiveInstanceId: (id: ConnectionInstanceId) => void;
  syncActiveInstanceFromComputer: () => void;
  invalidateBusinessStores: () => void;
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

  invalidateBusinessStores: () => {
    useFunctionSettingsStore.getState().invalidate();
  },
}));

export function getActiveInstanceId(): ConnectionInstanceId {
  return useConnectionStore.getState().activeInstanceId;
}

/** Call after switching relay target or on cold start. */
export async function bootstrapActiveInstance(): Promise<void> {
  const conn = useConnectionStore.getState();
  conn.syncActiveInstanceFromComputer();
  conn.invalidateBusinessStores();
  const { useEditorStore } = await import('@/hooks/use-editor-store');
  useEditorStore.setState({
    workspaceStates: {},
    navigationTargets: {},
    fileTreeRevealTarget: null,
    currentWorkspaceId: null,
    currentProjectPath: null,
    _hasHydrated: false,
  });
  restoreEditorFromInstancePrefs(conn.activeInstanceId);
  await useFunctionSettingsStore.getState().load().catch(() => undefined);
}
