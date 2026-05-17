'use client';

import type { ConnectionInstanceId } from '@/lib/connection-instance';
import { useUiPrefStore } from '@/hooks/use-ui-pref-store';
import type { OpenFile } from '@/hooks/use-editor-store';

export interface WorkspaceStatePersisted {
  openFiles: OpenFile[];
  activeFilePath: string | null;
}

export interface EditorUiPersisted {
  workspaceStates: Record<string, WorkspaceStatePersisted>;
  currentWorkspaceId: string | null;
  currentProjectPath: string | null;
}

const EMPTY_EDITOR_UI: EditorUiPersisted = {
  workspaceStates: {},
  currentWorkspaceId: null,
  currentProjectPath: null,
};

export function partializeEditorState(state: {
  workspaceStates: Record<string, { openFiles: OpenFile[]; activeFilePath: string | null }>;
  currentWorkspaceId: string | null;
  currentProjectPath: string | null;
}): EditorUiPersisted {
  return {
    workspaceStates: Object.fromEntries(
      Object.entries(state.workspaceStates).map(([wsId, ws]) => [
        wsId,
        {
          openFiles: ws.openFiles.map(f => ({
            ...f,
            content: '',
            originalContent: '',
            isLoading: true,
            isDirty: false,
            lastOpenedAt: f.lastOpenedAt ?? 0,
            lastFocusedAt: f.lastFocusedAt ?? 0,
          })),
          activeFilePath: ws.activeFilePath,
        },
      ]),
    ),
    currentWorkspaceId: state.currentWorkspaceId,
    currentProjectPath: state.currentProjectPath,
  };
}

export function readEditorUi(instanceId: ConnectionInstanceId): EditorUiPersisted {
  return useUiPrefStore.getState().readSlice(instanceId, 'editor', EMPTY_EDITOR_UI);
}

export function writeEditorUi(instanceId: ConnectionInstanceId, snapshot: EditorUiPersisted): void {
  useUiPrefStore.getState().writeSlice(instanceId, 'editor', snapshot);
}

let editorSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleEditorUiSave(
  instanceId: ConnectionInstanceId,
  snapshot: EditorUiPersisted,
): void {
  if (editorSaveTimer) {
    clearTimeout(editorSaveTimer);
  }
  editorSaveTimer = setTimeout(() => {
    editorSaveTimer = null;
    writeEditorUi(instanceId, snapshot);
  }, 50);
}
