/**
 * User access token helpers (APP-016) — possession = tenant, no account login.
 */

import { createTranslator } from 'next-intl';
import { proxyRelayRequest } from '@/features/connection/lib/atmos-computer-local';
import {
  resolveRelayUrl,
  useAtmosComputerStore,
} from '@/features/connection/lib/atmos-computer-store';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import { isTauriRuntime } from '@/shared/lib/desktop-runtime';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';

const RELAY_SECRET_HEADER = 'X-Atmos-Relay-Secret';
let cachedRuntimeLocale: 'en' | 'zh' | null = null;
let cachedRuntimeTranslator: ReturnType<typeof createTranslator> | null = null;

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

export function generateAccessToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const b of raw) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function formatFetchError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'Load failed' || message.includes('Failed to fetch')) {
    return runtimeT('accessToken.errors.cannotReachCloud');
  }
  return message;
}

/** Register token hash on the relay (idempotent on 409). */
export async function registerAccessTokenOnRelay(
  relayUrl: string,
  accessToken: string,
  relaySecretKey?: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = resolveRelayUrl(relayUrl);
  const payload = JSON.stringify({ token: accessToken.trim() });
  const relaySecret = resolveRelaySecretKey(relaySecretKey);

  try {
    const proxied = await proxyRelayRequest(base, 'POST', '/v1/tenants', {
      body: payload,
      relaySecretKey: relaySecret,
    });
    if (proxied) {
      if (proxied.status === 201 || proxied.status === 409) {
        return { ok: true };
      }
      try {
        const data = JSON.parse(proxied.body) as { error?: string };
        return { ok: false, error: data.error ?? `HTTP ${proxied.status}` };
      } catch {
        return { ok: false, error: `HTTP ${proxied.status}` };
      }
    }

    if (isTauriRuntime()) {
      return {
        ok: false,
        error: runtimeT('accessToken.errors.cannotConnectLocally'),
      };
    }

    const res = await fetch(`${base}/v1/tenants`, {
      method: 'POST',
      headers: relayHeaders(relaySecret),
      body: payload,
    });

    if (res.status === 201 || res.status === 409) {
      return { ok: true };
    }

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: formatFetchError(err) };
  }
}

export async function rotateAccessTokenOnRelay(
  relayUrl: string,
  currentAccessToken: string,
  newAccessToken: string,
  relaySecretKey?: string,
): Promise<{ ok: boolean; error?: string }> {
  const currentToken = currentAccessToken.trim();
  const nextToken = newAccessToken.trim();

  if (currentToken.length < 32) {
    return { ok: false, error: runtimeT('accessToken.errors.currentKeyTooShort') };
  }
  if (nextToken.length < 32) {
    return { ok: false, error: runtimeT('accessToken.errors.newKeyTooShort') };
  }
  if (currentToken === nextToken) {
    return { ok: false, error: runtimeT('accessToken.errors.newKeyMustDiffer') };
  }

  try {
    const res = await relayFetchWithAccessToken(
      relayUrl,
      currentToken,
      '/v1/tenants/rotate_token',
      {
        method: 'POST',
        body: JSON.stringify({ new_token: nextToken }),
      },
      relaySecretKey,
    );
    if (res.ok) {
      return { ok: true };
    }

    const data = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    return {
      ok: false,
      error: data?.error ?? data?.message ?? `HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, error: formatFetchError(err) };
  }
}

export async function relayFetchWithAccessToken(
  relayUrl: string,
  accessToken: string,
  path: string,
  init?: RequestInit,
  relaySecretKey?: string,
): Promise<Response> {
  const base = resolveRelayUrl(relayUrl);
  const token = accessToken.trim();
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
    accessToken: token || undefined,
    body,
    relaySecretKey: relaySecret,
  });
  if (proxied) {
    return new Response(proxied.body, {
      status: proxied.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isTauriRuntime()) {
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

function resolveRelaySecretKey(relaySecretKey?: string): string {
  return (relaySecretKey ?? useAtmosComputerStore.getState().relaySecretKey).trim();
}

function relayHeaders(relaySecretKey: string): HeadersInit {
  return relaySecretKey
    ? { 'Content-Type': 'application/json', [RELAY_SECRET_HEADER]: relaySecretKey }
    : { 'Content-Type': 'application/json' };
}
