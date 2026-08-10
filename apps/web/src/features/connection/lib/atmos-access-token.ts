/**
 * Hub device credential helpers for Relay (APP-056).
 * Bearer = Hub-minted device credential (not a user-generated Access Token).
 * There is no `POST /v1/tenants` — devices are projected from Hub.
 */

import { createTranslator } from 'next-intl';
import { proxyRelayRequest } from '@/features/connection/lib/atmos-computer-local';
import {
  resolveRelayUrl,
  useAtmosComputerStore,
} from '@/features/connection/lib/atmos-computer-store';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import { isDesktopRuntime } from '@/shared/lib/desktop-runtime';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';

const RELAY_SECRET_HEADER = 'X-Atmos-Relay-Secret';
const MIN_DEVICE_CREDENTIAL_LEN = 32;
let cachedRuntimeLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedRuntimeTranslator: any = null;

function runtimeT(
  key: string,
  values?: Record<string, string | number>,
): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedRuntimeTranslator || cachedRuntimeLocale !== locale) {
    cachedRuntimeLocale = locale;
    cachedRuntimeTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'project.runtime',
    });
  }
  return cachedRuntimeTranslator(key as never, values as never);
}

export function isPlausibleDeviceCredential(token: string): boolean {
  return token.trim().length >= MIN_DEVICE_CREDENTIAL_LEN;
}

/** @deprecated Use isPlausibleDeviceCredential — Access Token model removed. */
export function isPlausibleAccessToken(token: string): boolean {
  return isPlausibleDeviceCredential(token);
}

function formatFetchError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'Load failed' || message.includes('Failed to fetch')) {
    return runtimeT('accessToken.errors.cannotReachCloud');
  }
  return message;
}

/**
 * Relay REST with device credential Bearer.
 * Prefer loopback proxy (sends secret from computer-client.json when needed).
 */
export async function relayFetchWithDeviceCredential(
  relayUrl: string,
  deviceCredential: string,
  path: string,
  init?: RequestInit,
  relaySecretKey?: string,
): Promise<Response> {
  const base = resolveRelayUrl(relayUrl);
  const token = deviceCredential.trim();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const relaySecret = resolveRelaySecretKey(relaySecretKey);
  const method = (init?.method ?? 'GET').toUpperCase();
  const body =
    typeof init?.body === 'string'
      ? init.body
      : init?.body != null
        ? JSON.stringify(init.body)
        : undefined;

  const proxied = await proxyRelayRequest(base, method, normalizedPath, {
    deviceCredential: token || undefined,
    body,
    relaySecretKey: relaySecret,
  });
  if (proxied) {
    return new Response(proxied.body, {
      status: proxied.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isDesktopRuntime()) {
    throw new Error(runtimeT('accessToken.errors.cannotConnectLocally'));
  }
  if (!token) {
    throw new Error(runtimeT('accessToken.errors.relayAccessKeyUnavailable'));
  }

  const url = `${base}${normalizedPath}`;
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  if (relaySecret) {
    headers.set(RELAY_SECRET_HEADER, relaySecret);
  }
  return fetch(url, {
    ...init,
    method,
    headers,
    body: init?.body,
  });
}

/** @deprecated Use relayFetchWithDeviceCredential */
export const relayFetchWithAccessToken = relayFetchWithDeviceCredential;

function resolveRelaySecretKey(relaySecretKey?: string): string {
  return (relaySecretKey ?? useAtmosComputerStore.getState().relaySecretKey).trim();
}
