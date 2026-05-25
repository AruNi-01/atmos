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
import { useFunctionSettingsStore } from '@/features/settings/hooks/use-function-settings-store';
import { restoreEditorFromInstancePrefs } from '@/features/editor/lib/restore-editor-from-prefs';

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
  const activeInstanceId = useConnectionStore.getState().activeInstanceId;
  const [
    { useProjectStore },
    { useFileTreeStore },
    { useGitInfoStore },
  ] = await Promise.all([
    import('@/features/project/store/use-project-store'),
    import('@/features/files/store/use-file-tree-store'),
    import('@/features/git/store/use-git-info-store'),
  ]);
  useProjectStore.getState().resetForConnectionChange();
  useFileTreeStore.getState().clear();
  useGitInfoStore.getState().reset();
  const { useEditorStore } = await import('@/features/editor/store/use-editor-store');
  useEditorStore.setState({
    workspaceStates: {},
    navigationTargets: {},
    fileTreeRevealTarget: null,
    currentWorkspaceId: null,
    currentProjectPath: null,
    _hasHydrated: false,
  });
  restoreEditorFromInstancePrefs(activeInstanceId);
  await useFunctionSettingsStore.getState().load().catch(() => undefined);
}

/** Call after the new WS target is connected. */
export async function reloadActiveConnectionData(): Promise<void> {
  const { useProjectStore } = await import('@/features/project/store/use-project-store');
  await useProjectStore.getState().fetchProjects();
}
