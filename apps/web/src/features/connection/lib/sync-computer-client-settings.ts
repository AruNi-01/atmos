/**
 * Hub device credential + relay settings live in `~/.atmos/credentials/computer-client.json`.
 * APP-056: no user-generated Access Token.
 */

import {
  resolveRelayUrl,
  useAtmosComputerStore,
} from '@/features/connection/lib/atmos-computer-store';
import { getStoredDeviceCredential } from '@/api/hub-client';
import { getLoopbackHttpBase, isHostedAtmosOrigin } from '@/shared/lib/desktop-runtime';

export interface ComputerClientSettingsDisk {
  path: string;
  configured: boolean;
  device_credential: string;
  /** Legacy field if older API still returns it. */
  access_token?: string;
  device_id?: string | null;
  relay_url: string;
  relay_secret_key?: string;
  relay_secret_key_configured?: boolean;
}

export type ComputerClientSettingsSaveLocation = 'api' | 'none';

export interface ComputerClientSettingsSaveResult {
  persisted: boolean;
  location: ComputerClientSettingsSaveLocation;
}

function credentialFromDisk(disk: ComputerClientSettingsDisk): string {
  return (disk.device_credential || disk.access_token || '').trim();
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

async function computerClientSettingsTarget(): Promise<{
  base: string;
  headers: Record<string, string>;
} | null> {
  if (typeof window !== 'undefined' && isHostedAtmosOrigin()) {
    const store = useAtmosComputerStore.getState();
    if (
      store.connectionMode === 'relay' &&
      store.relayGatewayHttpBase &&
      store.relayClientToken
    ) {
      return {
        base: store.relayGatewayHttpBase.replace(/\/$/, ''),
        headers: { Authorization: `Bearer ${store.relayClientToken}` },
      };
    }
  }

  const base = await loopbackBase();
  if (!base) {
    return null;
  }
  return { base, headers: apiTokenHeader() };
}

export async function loadComputerClientSettingsFromDisk(): Promise<ComputerClientSettingsDisk | null> {
  const target = await computerClientSettingsTarget();
  if (!target) {
    return null;
  }

  let res: Response;
  try {
    res = await fetch(`${target.base}/api/system/computer-client-settings`, {
      headers: target.headers,
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

export async function saveComputerClientSettings(
  deviceCredential: string,
  relayUrl: string,
  relaySecretKey = '',
  deviceId?: string | null,
): Promise<ComputerClientSettingsSaveResult> {
  const target = await computerClientSettingsTarget();
  if (!target) {
    console.warn('[computer-client-settings] no Computer API — credential not written to disk');
    return { persisted: false, location: 'none' };
  }
  const relaySecret = relaySecretKey.trim();
  const body: Record<string, unknown> = {
    relay_url: resolveRelayUrl(relayUrl),
  };
  if (relaySecret || !(typeof window !== 'undefined' && isHostedAtmosOrigin())) {
    body.relay_secret_key = relaySecret;
  }
  const token = deviceCredential.trim();
  if (token) {
    body.device_credential = token;
  }
  if (deviceId !== undefined) {
    body.device_id = deviceId;
  }
  const res = await fetch(`${target.base}/api/system/computer-client-settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...target.headers,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn('[computer-client-settings] PUT failed', res.status, text);
    return { persisted: false, location: 'none' };
  }
  return { persisted: true, location: 'api' };
}

export async function saveComputerClientSettingsToDisk(
  deviceCredential: string,
  relayUrl: string,
  relaySecretKey = '',
  deviceId?: string | null,
): Promise<boolean> {
  const result = await saveComputerClientSettings(
    deviceCredential,
    relayUrl,
    relaySecretKey,
    deviceId,
  );
  return result.persisted;
}

export async function clearComputerClientSettingsOnDisk(): Promise<void> {
  const target = await computerClientSettingsTarget();
  if (!target) {
    return;
  }
  await fetch(`${target.base}/api/system/computer-client-settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...target.headers,
    },
    body: JSON.stringify({ clear: true }),
  }).catch(() => undefined);
}

/**
 * Load disk settings into the zustand store. If disk is empty but this page
 * already has an in-memory credential, push it to disk once a Computer API exists.
 * Also prefers browser Hub enroll (`atmos.device_credential`) when disk is empty.
 */
let hydrateOnce: Promise<void> | null = null;

/** Idempotent: safe to call from WebSocket connect and settings UI. */
export function ensureComputerClientSettingsHydrated(): Promise<void> {
  if (typeof window !== 'undefined' && isHostedAtmosOrigin()) {
    return hydrateComputerClientSettingsFromDisk();
  }
  if (!hydrateOnce) {
    hydrateOnce = hydrateComputerClientSettingsFromDisk();
  }
  return hydrateOnce;
}

export async function hydrateComputerClientSettingsFromDisk(): Promise<void> {
  const disk = await loadComputerClientSettingsFromDisk();
  const store = useAtmosComputerStore.getState();
  const { applyIdentityBearingComputerSettings } = await import(
    '@/features/connection/lib/query-identity-lifecycle'
  );

  if (disk) {
    const cred = credentialFromDisk(disk);
    if (disk.configured && cred.length >= 32) {
      await applyIdentityBearingComputerSettings({
        relayUrl: disk.relay_url,
        relaySecretKey: disk.relay_secret_key ?? '',
        accessToken: cred,
        accessTokenConfigured: true,
      });
      return;
    }
    await applyIdentityBearingComputerSettings({
      relayUrl: disk.relay_url,
      relaySecretKey: disk.relay_secret_key ?? '',
      accessTokenConfigured: Boolean(store.accessToken.trim().length >= 32),
    });
  } else {
    store.setAccessTokenConfigured(Boolean(store.accessToken.trim().length >= 32));
  }

  // Prefer Hub browser enroll when disk has no credential yet.
  const hubCred = getStoredDeviceCredential()?.trim() ?? '';
  const memory = useAtmosComputerStore.getState().accessToken.trim();
  const next = hubCred.length >= 32 ? hubCred : memory;
  if (next.length >= 32) {
    await applyIdentityBearingComputerSettings({
      accessToken: next,
      accessTokenConfigured: true,
    });
    const persisted = await saveComputerClientSettingsToDisk(
      next,
      useAtmosComputerStore.getState().relayUrl,
      useAtmosComputerStore.getState().relaySecretKey,
    );
    if (persisted) {
      await applyIdentityBearingComputerSettings({ accessTokenConfigured: true });
    }
  } else {
    // Cookie session without local device (e.g. re-login after sign-out): auto-mint.
    try {
      const { ensureLocalHubDevice } = await import(
        '@/features/connection/lib/ensure-local-hub-device'
      );
      await ensureLocalHubDevice();
    } catch {
      /* optional */
    }
  }
}
