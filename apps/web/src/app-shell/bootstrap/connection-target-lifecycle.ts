'use client';

import { restoreEditorFromInstancePrefs } from '@/features/editor/lib/restore-editor-from-prefs';
import {
  bootstrapActiveInstance,
  useConnectionStore,
} from '@/features/connection/store/connection-store';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';
import { getAtmosWebQueryClient } from '@/providers/app/query-client';
import { resetLegacyServerStateForConnectionChange } from '@/app-shell/bootstrap/legacy-server-state-reset';

/** App-level cleanup for data that is scoped to the currently selected Computer. */
export async function prepareConnectionTargetChange(): Promise<void> {
  // 1–3. Cancel and remove Computer-scoped Query snapshots for the outgoing target.
  const client = getAtmosWebQueryClient();
  await client.cancelQueries({ queryKey: ['atmos', 'computer'] });
  client.removeQueries({ queryKey: ['atmos', 'computer'] });

  // 4. Synchronize the new active instance id.
  const activeInstanceId = bootstrapActiveInstance();

  // 5. Bump centralized connection epoch (new Computer Query root).
  useConnectionStore.getState().bumpConnectionEpoch();

  // Compatibility: invalidate settings bootstrap cache until Settings cutover removes it.
  useFunctionSettingsStore.getState().invalidate();

  // Legacy Computer-scoped snapshots Query does not yet own.
  await resetLegacyServerStateForConnectionChange();

  const [
    { useProjectStore },
    { useFileTreeStore },
    { useGitInfoStore },
    { useEditorStore },
  ] = await Promise.all([
    import('@/features/project/store/use-project-store'),
    import('@/features/files/store/use-file-tree-store'),
    import('@/features/git/store/use-git-info-store'),
    import('@/features/editor/store/use-editor-store'),
  ]);

  useProjectStore.getState().resetForConnectionChange();
  useFileTreeStore.getState().clear();
  useGitInfoStore.getState().reset();
  useEditorStore.setState({
    workspaceStates: {},
    navigationTargets: {},
    fileTreeRevealTarget: null,
    currentWorkspaceId: null,
    currentProjectPath: null,
    _hasHydrated: false,
  });
  restoreEditorFromInstancePrefs(activeInstanceId);
}

/** Call after the new WS target is connected. */
export async function reloadActiveConnectionData(): Promise<void> {
  const { invalidateProjectBootstrap } = await import(
    '@/features/project/hooks/use-project-bootstrap-query'
  );
  await invalidateProjectBootstrap();
}
