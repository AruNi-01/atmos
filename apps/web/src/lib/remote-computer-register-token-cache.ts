/**
 * Cached registration code (register_token) for Settings → Remote computer.
 * Tied to the current access key + control plane; reused until server expiry.
 */

import { resolveControlPlaneUrl } from '@/lib/atmos-computer-store';
import { globalKey, readJson, removeKey, writeJson } from '@/lib/browser-store';

const CACHE_KEY = globalKey('remote-computer-register-token');

export interface RemoteComputerRegisterTokenCache {
  register_token: string;
  /** Server-side expiry (unix seconds). */
  expires_at: number;
  /** When this code was issued (unix seconds, client clock). */
  created_at: number;
  control_plane_url: string;
  access_token_fingerprint: string;
}

async function accessTokenFingerprint(accessToken: string): Promise<string> {
  const trimmed = accessToken.trim();
  if (trimmed.length === 0) {
    return '';
  }
  const data = new TextEncoder().encode(trimmed);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isRemoteComputerRegisterTokenCacheValid(
  cache: RemoteComputerRegisterTokenCache,
  accessToken: string,
  controlPlaneUrl: string,
  accessTokenFingerprintHex: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  const cp = resolveControlPlaneUrl(controlPlaneUrl);
  return (
    cache.access_token_fingerprint === accessTokenFingerprintHex &&
    cache.control_plane_url === cp &&
    cache.register_token.trim().length > 0 &&
    cache.expires_at > nowSec
  );
}

export async function loadRemoteComputerRegisterTokenCache(
  accessToken: string,
  controlPlaneUrl: string,
): Promise<RemoteComputerRegisterTokenCache | null> {
  const fp = await accessTokenFingerprint(accessToken);
  if (!fp) {
    return null;
  }
  const cache = readJson<RemoteComputerRegisterTokenCache | null>(CACHE_KEY, null);
  if (
    !cache ||
    !isRemoteComputerRegisterTokenCacheValid(cache, accessToken, controlPlaneUrl, fp)
  ) {
    return null;
  }
  return cache;
}

export async function saveRemoteComputerRegisterTokenCache(
  accessToken: string,
  controlPlaneUrl: string,
  registerToken: string,
  expiresAt: number,
): Promise<void> {
  const fp = await accessTokenFingerprint(accessToken);
  const entry: RemoteComputerRegisterTokenCache = {
    register_token: registerToken,
    expires_at: expiresAt,
    created_at: Math.floor(Date.now() / 1000),
    control_plane_url: resolveControlPlaneUrl(controlPlaneUrl),
    access_token_fingerprint: fp,
  };
  writeJson(CACHE_KEY, entry);
}

export function clearRemoteComputerRegisterTokenCache(): void {
  removeKey(CACHE_KEY);
}
