'use client';

import { isTauriRuntime } from '@/lib/desktop-runtime';

export type UpdateInfo = {
  version: string;
  body?: string;
  currentVersion: string;
  date?: string;
};

export type UpdateStatus =
  | { stage: 'idle' }
  | { stage: 'checking' }
  | { stage: 'available'; info: UpdateInfo }
  | { stage: 'downloading'; downloaded: number; total: number | null }
  | { stage: 'installing' }
  | { stage: 'done' }
  | { stage: 'error'; message: string }
  | { stage: 'upToDate' };

/**
 * Check for desktop app updates via the Tauri updater plugin.
 * In web builds this is a safe no-op that resolves to null.
 */
export async function checkForUpdate(
  onStatus?: (status: UpdateStatus) => void,
): Promise<UpdateInfo | null> {
  if (!isTauriRuntime()) return null;

  try {
    onStatus?.({ stage: 'checking' });

    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (!update) {
      onStatus?.({ stage: 'upToDate' });
      return null;
    }

    const info: UpdateInfo = {
      version: update.version,
      body: update.body,
      currentVersion: update.currentVersion,
      date: update.date,
    };

    onStatus?.({ stage: 'available', info });
    return info;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    onStatus?.({ stage: 'error', message });
    return null;
  }
}

/**
 * Download and install a pending update, then restart the app.
 */
export async function downloadAndInstallUpdate(
  onStatus?: (status: UpdateStatus) => void,
): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const { relaunch } = await import('@tauri-apps/plugin-process');

    const update = await check();
    if (!update) return;

    let downloaded = 0;

    onStatus?.({ stage: 'downloading', downloaded: 0, total: null });

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          onStatus?.({
            stage: 'downloading',
            downloaded: 0,
            total: event.data.contentLength ?? null,
          });
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          onStatus?.({
            stage: 'downloading',
            downloaded,
            total: null,
          });
          break;
        case 'Finished':
          onStatus?.({ stage: 'installing' });
          break;
      }
    });

    onStatus?.({ stage: 'done' });
    await relaunch();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    onStatus?.({ stage: 'error', message });
  }
}
