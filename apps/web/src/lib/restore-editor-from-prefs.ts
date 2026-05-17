'use client';

import { parseConnectionInstanceId } from '@/lib/connection-instance';
import { readActiveInstanceIdRaw } from '@/lib/browser-store';
import { readEditorUi } from '@/lib/editor-ui-persistence';
import { useEditorStore } from '@/hooks/use-editor-store';
import type { ConnectionInstanceId } from '@/lib/connection-instance';

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
