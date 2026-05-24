'use client';

import { parseConnectionInstanceId } from '@/features/connection/lib/connection-instance';
import { readActiveInstanceIdRaw } from '@/shared/lib/browser-store';
import { readEditorUi } from '@/features/editor/lib/editor-ui-persistence';
import { useEditorStore } from '@/features/editor/store/use-editor-store';
import type { ConnectionInstanceId } from '@/features/connection/lib/connection-instance';

export function restoreEditorFromInstancePrefs(
  instanceId?: ConnectionInstanceId,
): void {
  const id =
    instanceId ??
    parseConnectionInstanceId(
      typeof window !== 'undefined' ? readActiveInstanceIdRaw() : null,
    );
  const persisted = readEditorUi(id);
  useEditorStore.setState({
    workspaceStates: persisted.workspaceStates,
    currentWorkspaceId: persisted.currentWorkspaceId,
    currentProjectPath: persisted.currentProjectPath,
    _hasHydrated: true,
  });
  for (const [wsId, ws] of Object.entries(persisted.workspaceStates)) {
    for (const file of ws.openFiles) {
      void useEditorStore.getState().reloadFileContent(file.path, wsId);
    }
  }
}
