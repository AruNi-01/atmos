'use client';

import { isTauriRuntime } from '@/lib/desktop-runtime';
import type { Update } from '@tauri-apps/plugin-updater';
import { invoke } from '@tauri-apps/api/core';

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
let isInstallingUpdate = false;

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

  const normalizedVersion = updateInfo.version.startsWith('desktop-v')
    ? updateInfo.version
    : updateInfo.version.startsWith('v')
      ? `desktop-${updateInfo.version}`
      : `desktop-v${updateInfo.version}`;

  return `${RELEASES_BASE_URL}/tag/${normalizedVersion}`;
}

/**
 * Get the current version info from the desktop app.
 */
async function getVersionInfo(): Promise<{ version: string; version_type: string } | null> {
  if (!isTauriRuntime()) return null;

  try {
    return await invoke('get_version_info');
  } catch (e) {
    console.error('Failed to get version info:', e);
    return null;
  }
}

/**
 * Parse a version string into components.
 * Examples:
 * - "1.1.0" -> { major: 1, minor: 1, patch: 0, prereleaseType: null, prereleaseNumber: null }
 * - "1.1.0-rc.5" -> { major: 1, minor: 1, patch: 0, prereleaseType: "rc", prereleaseNumber: 5 }
 * - "1.1.1-beta.1" -> { major: 1, minor: 1, patch: 1, prereleaseType: "beta", prereleaseNumber: 1 }
 */
export function parseVersion(version: string) {
  // Remove 'desktop-v' prefix if present
  const cleanVersion = version.replace(/^desktop-v/, '');
  
  // Split by '-' to separate main version from prerelease
  const [mainVersion, prereleasePart] = cleanVersion.split('-');
  
  // Parse main version (e.g., "1.1.0")
  const [major, minor, patch] = mainVersion.split('.').map(Number);
  
  // Parse prerelease part if present (e.g., "rc.5")
  let prereleaseType: string | null = null;
  let prereleaseNumber: number | null = null;
  
  if (prereleasePart) {
    const [type, number] = prereleasePart.split('.');
    prereleaseType = type;
    prereleaseNumber = number ? parseInt(number, 10) : null;
  }
  
  return {
    major,
    minor,
    patch,
    prereleaseType,
    prereleaseNumber,
  };
}

/**
 * Compare two version strings.
 * Returns:
 * - 1 if versionA > versionB
 * - -1 if versionA < versionB
 * - 0 if versionA == versionB
 * 
 * Comparison rules:
 * 1. Main version numbers are compared first (major.minor.patch)
 * 2. If main versions are equal, prerelease type is compared (stable > rc > beta > alpha)
 * 3. If prerelease types are equal, prerelease numbers are compared
 * 4. Stable versions (no prerelease) are always greater than prerelease versions with same main version
 */
export function compareVersions(versionA: string, versionB: string): number {
  const parsedA = parseVersion(versionA);
  const parsedB = parseVersion(versionB);
  
  // Compare main version numbers
  if (parsedA.major !== parsedB.major) {
    return parsedA.major > parsedB.major ? 1 : -1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor > parsedB.minor ? 1 : -1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch > parsedB.patch ? 1 : -1;
  }
  
  // Main versions are equal, compare prerelease status
  // Stable (no prerelease) is greater than any prerelease
  if (!parsedA.prereleaseType && parsedB.prereleaseType) {
    return 1; // A is stable, B is prerelease
  }
  if (parsedA.prereleaseType && !parsedB.prereleaseType) {
    return -1; // A is prerelease, B is stable
  }
  if (!parsedA.prereleaseType && !parsedB.prereleaseType) {
    return 0; // Both are stable and equal
  }
  
  // Both are prerelease, compare type priority
  const typePriority: { [key: string]: number } = {
    'rc': 3,
    'beta': 2,
    'alpha': 1,
  };
  
  const priorityA = typePriority[parsedA.prereleaseType || ''] || 0;
  const priorityB = typePriority[parsedB.prereleaseType || ''] || 0;
  
  if (priorityA !== priorityB) {
    return priorityA > priorityB ? 1 : -1;
  }
  
  // Same prerelease type, compare numbers
  if (parsedA.prereleaseNumber !== parsedB.prereleaseNumber) {
    return (parsedA.prereleaseNumber || 0) > (parsedB.prereleaseNumber || 0) ? 1 : -1;
  }
  
  return 0; // Versions are equal
}

/**
 * Fetch the latest release for a specific version type from GitHub API.
 * Returns the latest version tag that is greater than the current version.
 */
async function getLatestReleaseForVersionType(
  versionType: string,
  currentVersion: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      'https://api.github.com/repos/AruNi-01/atmos/releases?per_page=100',
      {
        headers: {
          'User-Agent': 'atmos-desktop-updater',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub API returned error: ${response.status}`);
    }

    const releases = await response.json();

    // Filter releases based on version type
    const filteredReleases = releases.filter((release: any) => {
      if (versionType === 'stable') {
        return !release.prerelease;
      } else if (versionType === 'rc') {
        return release.prerelease && release.tag_name.includes('-rc.');
      } else if (versionType === 'beta') {
        return release.prerelease && release.tag_name.includes('-beta.');
      } else if (versionType === 'alpha') {
        return release.prerelease && release.tag_name.includes('-alpha.');
      }
      return false;
    });

    if (filteredReleases.length === 0) {
      return null;
    }

    // Find the latest version that is greater than current version
    // Use smart version comparison instead of just published_at
    const latestRelease = filteredReleases
      .map((release: any) => ({
        ...release,
        tagName: release.tag_name,
      }))
      .filter((release: any) => {
        // Only consider versions that are greater than current version
        return compareVersions(release.tagName, currentVersion) > 0;
      })
      .sort((a: any, b: any) => {
        // Sort by version (descending)
        return compareVersions(b.tagName, a.tagName);
      })[0];

    return latestRelease?.tagName || null;
  } catch (e) {
    console.error('Failed to fetch latest release:', e);
    return null;
  }
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

    // Get current version info
    const versionInfo = await getVersionInfo();
    if (!versionInfo) {
      // Fallback to default behavior if we can't get version info
      return await checkForUpdateDefault(onStatus);
    }

    // For stable versions, use the default Tauri updater
    if (versionInfo.version_type === 'stable') {
      return await checkForUpdateDefault(onStatus);
    }

    // For prerelease versions (rc/beta/alpha), use custom logic
    const latestTag = await getLatestReleaseForVersionType(
      versionInfo.version_type,
      versionInfo.version,
    );
    if (!latestTag) {
      onStatus?.({ stage: 'upToDate' });
      return null;
    }

    // Extract version number from tag (remove 'desktop-v' prefix)
    const latestVersion = latestTag.replace('desktop-v', '');
    
    // For prerelease versions, we can't use the Tauri updater directly
    // because it only supports the latest.json endpoint.
    // Instead, we'll inform the user about the available update
    // and direct them to the GitHub releases page.
    const info: UpdateInfo = {
      version: latestVersion,
      currentVersion: versionInfo.version,
      body: `A new ${versionInfo.version_type} version is available. Please download it from GitHub releases.`,
    };

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
 * Default update check using Tauri updater plugin.
 */
async function checkForUpdateDefault(
  onStatus?: (status: UpdateStatus) => void,
): Promise<UpdateInfo | null> {
  try {
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
  if (isInstallingUpdate) return;

  try {
    isInstallingUpdate = true;
    const { check } = await import('@tauri-apps/plugin-updater');
    const { relaunch } = await import('@tauri-apps/plugin-process');

    const update = pendingUpdate ?? (await check());
    if (!update) {
      pendingUpdate = null;
      onStatus?.({ stage: 'upToDate' });
      return;
    }

    pendingUpdate = update;

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
  } finally {
    isInstallingUpdate = false;
  }
}
