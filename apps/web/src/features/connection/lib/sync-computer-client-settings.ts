/**
 * User Access Token + control plane URL live in `~/.atmos/computer-client.json`.
 * Web (loopback) and Desktop share this file via the local Atmos Server API.
 */

import {
  resolveControlPlaneUrl,
  useAtmosComputerStore,
} from '@/features/connection/lib/atmos-computer-store';
import { getLoopbackHttpBase, isHostedAtmosOrigin } from '@/shared/lib/desktop-runtime';

export interface ComputerClientSettingsDisk {
  path: string;
  configured: boolean;
  access_token: string;
  control_plane_url: string;
}

function apiTokenHeader(): Record<string, string> {
  const token =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_TOKEN : undefined;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function loopbackBase(): Promise<string | null> {
  try {
    return (await getLoopbackHttpBase()).replace(/\/$/, '');
  } catch {
    return null;
  }
}

export async function loadComputerClientSettingsFromDisk(): Promise<ComputerClientSettingsDisk | null> {
  // Hosted web (app.atmos.land) cannot read ~/.atmos via loopback from the browser.
  if (typeof window !== 'undefined' && isHostedAtmosOrigin()) {
    return null;
  }

  const base = await loopbackBase();
  if (!base) {
    return null;
  }

  let res: Response;
  try {
    res = await fetch(`${base}/api/system/computer-client-settings`, {
      headers: apiTokenHeader(),
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    return null;
  }
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: ComputerClientSettingsDisk;
  } | null;
  if (!json?.success || !json.data) {
    return null;
  }
  return json.data;
}

export async function saveComputerClientSettingsToDisk(
  accessToken: string,
  controlPlaneUrl: string,
): Promise<boolean> {
  if (typeof window !== 'undefined' && isHostedAtmosOrigin()) {
    return false;
  }

  const base = await loopbackBase();
  if (!base) {
    console.warn('[computer-client-settings] no loopback API — token not written to disk');
    return false;
  }
  const res = await fetch(`${base}/api/system/computer-client-settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...apiTokenHeader(),
    },
    body: JSON.stringify({
      access_token: accessToken.trim(),
      control_plane_url: resolveControlPlaneUrl(controlPlaneUrl),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn('[computer-client-settings] PUT failed', res.status, text);
    return false;
  }
  return true;
}

export async function clearComputerClientSettingsOnDisk(): Promise<void> {
  if (typeof window !== 'undefined' && isHostedAtmosOrigin()) {
    return;
  }

  const base = await loopbackBase();
  if (!base) {
    return;
  }
  await fetch(`${base}/api/system/computer-client-settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...apiTokenHeader(),
    },
    body: JSON.stringify({ clear: true }),
  }).catch(() => undefined);
}

/**
 * Load disk settings into the zustand store. If disk is empty but the store still
 * has a token (legacy localStorage), push it to disk once.
 */
let hydrateOnce: Promise<void> | null = null;

/** Idempotent: safe to call from WebSocket connect and settings UI. */
export function ensureComputerClientSettingsHydrated(): Promise<void> {
  if (!hydrateOnce) {
    hydrateOnce = hydrateComputerClientSettingsFromDisk();
  }
  return hydrateOnce;
}

export async function hydrateComputerClientSettingsFromDisk(): Promise<void> {
  const disk = await loadComputerClientSettingsFromDisk();
  const store = useAtmosComputerStore.getState();

  if (disk?.configured && disk.access_token.trim().length >= 32) {
    store.setAccessToken(disk.access_token);
    store.setControlPlaneUrl(disk.control_plane_url);
    return;
  }

  const legacy = store.accessToken.trim();
  if (legacy.length >= 32) {
    await saveComputerClientSettingsToDisk(legacy, store.controlPlaneUrl);
  }
}
