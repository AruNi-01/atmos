'use client';

import { isTauriRuntime } from '@/lib/desktop-runtime';
import type { Update } from '@tauri-apps/plugin-updater';

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

const RELEASES_BASE_URL = 'https://github.com/AruNi-01/atmos/releases';

let pendingUpdate: Update | null = null;

function toUpdateInfo(update: Update): UpdateInfo {
  return {
    version: update.version,
    body: update.body,
    currentVersion: update.currentVersion,
    date: update.date,
  };
}

export function getUpdateReleaseNotesUrl(updateInfo?: UpdateInfo | null): string {
  if (!updateInfo?.version) {
    return RELEASES_BASE_URL;
  }

  const normalizedVersion = updateInfo.version.startsWith('v')
    ? updateInfo.version
    : `v${updateInfo.version}`;

  return `${RELEASES_BASE_URL}/tag/${normalizedVersion}`;
}

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
      pendingUpdate = null;
      onStatus?.({ stage: 'upToDate' });
      return null;
    }

    pendingUpdate = update;
    const info = toUpdateInfo(update);

    onStatus?.({ stage: 'available', info });
    return info;
  } catch (e) {
    pendingUpdate = null;
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

    const update = pendingUpdate ?? (await check());
    if (!update) {
      pendingUpdate = null;
      onStatus?.({ stage: 'upToDate' });
      return;
    }

    pendingUpdate = update;
    onStatus?.({ stage: 'available', info: toUpdateInfo(update) });

    let downloaded = 0;
    let total: number | null = null;

    onStatus?.({ stage: 'downloading', downloaded: 0, total: null });

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          total = event.data.contentLength ?? null;
          onStatus?.({
            stage: 'downloading',
            downloaded: 0,
            total,
          });
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          onStatus?.({
            stage: 'downloading',
            downloaded,
            total,
          });
          break;
        case 'Finished':
          onStatus?.({ stage: 'installing' });
          break;
      }
    });

    pendingUpdate = null;
    onStatus?.({ stage: 'done' });
    await relaunch();
  } catch (e) {
    pendingUpdate = null;
    const message = e instanceof Error ? e.message : String(e);
    onStatus?.({ stage: 'error', message });
  }
}
