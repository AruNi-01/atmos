'use client';

import { desktopInvoke, isDesktopRuntime } from './desktop-bridge';

/**
 * Whether the current UI can open the OS folder picker (Desktop shells: Tauri / Electron).
 * Web / browser builds keep using the in-app FileBrowser (remote FS via WS).
 */
export function canUseNativeDirectoryPicker(): boolean {
  return isDesktopRuntime();
}

/** @deprecated Use canUseNativeDirectoryPicker */
export const isDesktopDirectoryPickerAvailable = canUseNativeDirectoryPicker;

/**
 * Open the native OS directory picker. Returns null if cancelled or unavailable.
 * Callers should only invoke this when `canUseNativeDirectoryPicker()` is true.
 */
export async function pickLocalDirectory(options?: {
  defaultPath?: string;
  title?: string;
}): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null;
  }

  try {
    const result = await desktopInvoke<string | null>('open_path_dialog', {
      directory: true,
      defaultPath: options?.defaultPath,
      title: options?.title,
    });
    if (typeof result === 'string' && result.length > 0) {
      return result;
    }
    // Electron returns null on cancel; Tauri may not implement open_path_dialog.
    if (result === null) {
      return null;
    }
  } catch {
    // Fall through to Tauri dialog plugin.
  }

  try {
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
  } catch {
    return null;
  }
  return null;
}

/** @deprecated Use pickLocalDirectory */
export const pickDesktopDirectory = pickLocalDirectory;
