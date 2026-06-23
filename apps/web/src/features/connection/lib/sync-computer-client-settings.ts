/**
 * User Access Token + relay settings live in `~/.atmos/computer-client.json`.
 * Web (loopback) and Desktop share this file via the local Atmos Server API.
 */

import {
  resolveRelayUrl,
  useAtmosComputerStore,
} from '@/features/connection/lib/atmos-computer-store';
import { getLoopbackHttpBase, isHostedAtmosOrigin } from '@/shared/lib/desktop-runtime';

export interface ComputerClientSettingsDisk {
  path: string;
  configured: boolean;
  access_token: string;
  relay_url: string;
  relay_secret_key?: string;
  relay_secret_key_configured?: boolean;
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

export async function saveComputerClientSettingsToDisk(
  accessToken: string,
  relayUrl: string,
  relaySecretKey = '',
): Promise<boolean> {
  const target = await computerClientSettingsTarget();
  if (!target) {
    console.warn('[computer-client-settings] no Computer API — token not written to disk');
    return false;
  }
  const relaySecret = relaySecretKey.trim();
  const body: Record<string, unknown> = {
    relay_url: resolveRelayUrl(relayUrl),
  };
  if (relaySecret || !(typeof window !== 'undefined' && isHostedAtmosOrigin())) {
    body.relay_secret_key = relaySecret;
  }
  const token = accessToken.trim();
  if (token) {
    body.access_token = token;
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
    return false;
  }
  return true;
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
 * Load disk settings into the zustand store. If disk is empty but the store still
 * has a token (legacy localStorage), push it to disk once.
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
  store.setAccessTokenConfigured(Boolean(disk?.configured || store.accessToken.trim().length >= 32));

  if (disk?.configured && disk.access_token.trim().length >= 32) {
    store.setRelayUrl(disk.relay_url);
    store.setRelaySecretKey(disk.relay_secret_key ?? '');
    store.setAccessToken(disk.access_token);
    return;
  }

  if (disk) {
    store.setRelayUrl(disk.relay_url);
    store.setRelaySecretKey(disk.relay_secret_key ?? '');
  }

  const legacy = store.accessToken.trim();
  if (legacy.length >= 32) {
    const persisted = await saveComputerClientSettingsToDisk(
      legacy,
      store.relayUrl,
      store.relaySecretKey,
    );
    if (persisted) {
      store.setAccessTokenConfigured(true);
    }
  }
}
