import { fsApi } from '@/api/ws-api';
import type { FileNavigationTarget, OpenFile } from './editor-store-types';

export async function readFileWithTimeout(path: string, timeoutMs = 12000) {
  return Promise.race([
    fsApi.readFile(path),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Read timeout: ${path}`)), timeoutMs)
    ),
  ]);
}

export function nowTimestamp(): number {
  return Date.now();
}

export function applyDiffGroupActiveFile(
  diffGroupActiveFiles: Record<string, Record<string, string>>,
  workspaceId: string,
  groupPath: string,
  filePath: string,
): Record<string, Record<string, string>> {
  const current = diffGroupActiveFiles[workspaceId]?.[groupPath];
  if (current === filePath) return diffGroupActiveFiles;
  return {
    ...diffGroupActiveFiles,
    [workspaceId]: {
      ...(diffGroupActiveFiles[workspaceId] || {}),
      [groupPath]: filePath,
    },
  };
}

export function removeNavigationTargetForPath(
  navigationTargets: Record<string, Record<string, FileNavigationTarget>>,
  workspaceId: string,
  path: string,
) {
  const workspaceTargets = navigationTargets[workspaceId];
  if (!workspaceTargets?.[path]) {
    return navigationTargets;
  }

  const remainingTargets = { ...workspaceTargets };
  delete remainingTargets[path];
  return {
    ...navigationTargets,
    [workspaceId]: remainingTargets,
  };
}

export function touchOpenFile(
  file: OpenFile,
  timestamp: number,
  updates?: Partial<Pick<OpenFile, 'lastOpenedAt' | 'lastFocusedAt' | 'isPreview'>>
): OpenFile {
  return {
    ...file,
    lastOpenedAt: updates?.lastOpenedAt ?? file.lastOpenedAt ?? timestamp,
    lastFocusedAt: updates?.lastFocusedAt ?? file.lastFocusedAt ?? timestamp,
    isPreview: updates?.isPreview ?? file.isPreview,
  };
}
