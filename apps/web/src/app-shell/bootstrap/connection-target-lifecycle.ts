'use client';

import { restoreEditorFromInstancePrefs } from '@/features/editor/lib/restore-editor-from-prefs';
import { bootstrapActiveInstance } from '@/features/connection/store/connection-store';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';

/** App-level cleanup for data that is scoped to the currently selected Computer. */
export async function prepareConnectionTargetChange(): Promise<void> {
  const activeInstanceId = bootstrapActiveInstance();
  useFunctionSettingsStore.getState().invalidate();

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
  await useFunctionSettingsStore.getState().load().catch(() => undefined);
}

/** Call after the new WS target is connected. */
export async function reloadActiveConnectionData(): Promise<void> {
  const { useProjectStore } = await import('@/features/project/store/use-project-store');
  await useProjectStore.getState().fetchProjects();
}
