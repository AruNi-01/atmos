'use client';

import { isTauriRuntime } from './desktop-runtime';

/**
 * Whether the current UI can open the OS folder picker (Tauri Desktop only).
 * Web / browser builds keep using the in-app FileBrowser (remote FS via WS).
 */
export function canUseNativeDirectoryPicker(): boolean {
  return isTauriRuntime();
}

/**
 * Open the native OS directory picker. Returns null if cancelled or unavailable.
 * Callers should only invoke this when `canUseNativeDirectoryPicker()` is true.
 */
export async function pickLocalDirectory(options?: {
  defaultPath?: string;
  title?: string;
}): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath: options?.defaultPath,
    title: options?.title,
  });

  if (typeof selected === 'string' && selected.length > 0) {
    return selected;
  }
  return null;
}
