import type { FileTreeNode } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';

export interface FileTreeItem {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  isIgnored: boolean;
  symlinkTarget?: string;
  children?: string[];
}

export type PendingPanelMode = 'create-file' | 'create-folder' | 'rename';

export type PendingPanelState =
  | null
  | {
      mode: PendingPanelMode;
      targetPath: string;
      parentPath: string;
      initialName: string;
      title: string;
      description: string;
      confirmLabel: string;
    };

export interface FileTreeMenuState {
  x: number;
  y: number;
  itemPath: string;
}

export function buildItemsMap(nodes: FileTreeNode[]): Map<string, FileTreeItem> {
  const map = new Map<string, FileTreeItem>();

  function traverse(entries: FileTreeNode[]) {
    for (const node of entries) {
      map.set(node.path, {
        id: node.path,
        name: node.name,
        path: node.path,
        isDir: node.is_dir,
        isSymlink: node.is_symlink,
        isIgnored: node.is_ignored,
        symlinkTarget: node.symlink_target,
        children: node.children?.map((child) => child.path),
      });
      if (node.children) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);
  return map;
}

export function getParentPath(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

export function getBaseName(path: string): string {
  return path.split('/').pop() || path;
}

export function joinPath(parentPath: string, name: string): string {
  return parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
}

export function buildDuplicateName(name: string, isDir: boolean): string {
  if (isDir) {
    return `${name} copy`;
  }

  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) {
    return `${name} copy`;
  }

  const stem = name.slice(0, lastDot);
  const ext = name.slice(lastDot);
  return `${stem} copy${ext}`;
}

export function getRenameSelectionEnd(name: string, isDir: boolean): number {
  if (isDir || !name.includes('.')) {
    return name.length;
  }

  return (name.split('.')[0] ?? name).length;
}

export async function copyToClipboard(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toastManager.add({
      title: 'Copied',
      description: successMessage,
      type: 'success',
    });
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    toastManager.add({
      title: 'Copy failed',
      description: 'Could not copy to clipboard.',
      type: 'error',
    });
  }
}
