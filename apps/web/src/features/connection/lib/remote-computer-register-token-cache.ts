/**
 * Cached registration code (register_token) for Settings → Remote computer.
 * Tied to the current access key + relay + relay secret; reused until server expiry.
 */

import { resolveRelayUrl } from '@/features/connection/lib/atmos-computer-store';
import { globalKey, readJson, removeKey, writeJson } from '@/shared/lib/browser-store';

const CACHE_KEY = globalKey('remote-computer-register-token');

export interface RemoteComputerRegisterTokenCache {
  register_token: string;
  /** Server-side expiry (unix seconds). */
  expires_at: number;
  /** When this code was issued (unix seconds, client clock). */
  created_at: number;
  relay_url: string;
  access_token_fingerprint: string;
  relay_secret_fingerprint?: string;
}

async function secretFingerprint(secret: string): Promise<string> {
  const trimmed = secret.trim();
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
  relayUrl: string,
  accessTokenFingerprintHex: string,
  relaySecretFingerprintHex = '',
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  const relayOrigin = resolveRelayUrl(relayUrl);
  return (
    cache.access_token_fingerprint === accessTokenFingerprintHex &&
    (cache.relay_secret_fingerprint ?? '') === relaySecretFingerprintHex &&
    cache.relay_url === relayOrigin &&
    cache.register_token.trim().length > 0 &&
    cache.expires_at > nowSec
  );
}

export async function loadRemoteComputerRegisterTokenCache(
  accessToken: string,
  relayUrl: string,
  relaySecretKey = '',
): Promise<RemoteComputerRegisterTokenCache | null> {
  const fp = await secretFingerprint(accessToken);
  if (!fp) {
    return null;
  }
  const relayFp = await secretFingerprint(relaySecretKey);
  const cache = readJson<RemoteComputerRegisterTokenCache | null>(CACHE_KEY, null);
  if (
    !cache ||
    !isRemoteComputerRegisterTokenCacheValid(
      cache,
      accessToken,
      relayUrl,
      fp,
      relayFp,
    )
  ) {
    return null;
  }
  return cache;
}

export async function saveRemoteComputerRegisterTokenCache(
  accessToken: string,
  relayUrl: string,
  relaySecretKey: string,
  registerToken: string,
  expiresAt: number,
): Promise<void> {
  const fp = await secretFingerprint(accessToken);
  const relayFp = await secretFingerprint(relaySecretKey);
  const entry: RemoteComputerRegisterTokenCache = {
    register_token: registerToken,
    expires_at: expiresAt,
    created_at: Math.floor(Date.now() / 1000),
    relay_url: resolveRelayUrl(relayUrl),
    access_token_fingerprint: fp,
    relay_secret_fingerprint: relayFp,
  };
  writeJson(CACHE_KEY, entry);
}

export function clearRemoteComputerRegisterTokenCache(): void {
  removeKey(CACHE_KEY);
}
