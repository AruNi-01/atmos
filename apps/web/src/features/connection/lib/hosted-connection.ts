'use client';

import { createTranslator } from 'next-intl';
import type { ComputerRow } from '@/features/connection/lib/connection-ui-prefs';
import { fetchRelayRuntimeInfo } from '@/api/relay';
import { relayFetchWithAccessToken, registerAccessTokenOnRelay } from '@/features/connection/lib/atmos-access-token';
import {
  getHostedLoopbackCandidates,
  httpBase,
  type ApiConfig,
} from '@/shared/lib/desktop-runtime';
import type { LocalComputerStatus } from '@/features/connection/lib/atmos-computer-local';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';

const HOSTED_CONNECTION_PREF_KEY = 'atmos:v1:hosted:last-target';
let cachedRuntimeLocale: 'en' | 'zh' | null = null;
let cachedRuntimeTranslator: any = null;

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

export type HostedConnectionPreference = 'local' | 'relay';

export interface HostedRemoteSession {
  ws_url: string;
  gateway_url: string;
  client_token: string;
}

export function runtimeT(
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

function apiTokenHeaders(): Record<string, string> {
  const token =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_TOKEN : undefined;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function parseEnvelope<T>(raw: string): ApiEnvelope<T> | null {
  try {
    return JSON.parse(raw) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

function formatNetworkError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'Load failed' || message.includes('Failed to fetch')) {
    return runtimeT('hostedConnection.errors.cannotReachLocalServer');
  }
  return message;
}

async function fetchLoopbackJson<T>(cfg: ApiConfig, path: string): Promise<T> {
  const res = await fetch(`${httpBase(cfg).replace(/\/$/, '')}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...apiTokenHeaders(),
    },
  });

  const raw = await res.text().catch(() => '');
  const envelope = parseEnvelope<T>(raw);
  if (!res.ok || !envelope?.success || !envelope.data) {
    throw new Error(
      envelope?.error ??
        envelope?.message ??
        (res.status === 405 || raw.trimStart().startsWith('<!')
          ? runtimeT('hostedConnection.errors.computerApiUnavailable')
          : `HTTP ${res.status}`),
    );
  }

  return envelope.data;
}

export async function detectHostedLocalServer(): Promise<{
  config: ApiConfig;
  status: LocalComputerStatus;
}> {
  let lastError: unknown = null;
  for (const cfg of getHostedLoopbackCandidates(
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_TOKEN || undefined : undefined,
  )) {
    try {
      const status = await fetchLoopbackJson<LocalComputerStatus>(cfg, '/api/system/computer');
      return { config: cfg, status };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(formatNetworkError(lastError));
}

export async function ensureHostedAccessTokenReady(
  relayUrl: string,
  accessToken: string,
  relaySecretKey?: string,
): Promise<void> {
  const token = accessToken.trim();
  if (token.length < 32) {
    throw new Error(runtimeT('hostedConnection.errors.accessKeyTooShort'));
  }
  const result = await registerAccessTokenOnRelay(relayUrl, token, relaySecretKey);
  if (!result.ok) {
    throw new Error(result.error ?? runtimeT('hostedConnection.errors.couldNotSaveAccessKey'));
  }
}

export async function listHostedRemoteComputers(
  relayUrl: string,
  accessToken: string,
  relaySecretKey?: string,
): Promise<ComputerRow[]> {
  if (accessToken.trim().length >= 32) {
    await ensureHostedAccessTokenReady(relayUrl, accessToken, relaySecretKey);
  }
  const res = await relayFetchWithAccessToken(
    relayUrl,
    accessToken,
    '/v1/computers',
    undefined,
    relaySecretKey,
  );
  const data = (await res.json().catch(() => null)) as { computers?: ComputerRow[]; error?: string } | null;
  if (!res.ok) {
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  return data?.computers ?? [];
}

export async function createHostedRemoteSession(
  relayUrl: string,
  accessToken: string,
  serverId: string,
  relaySecretKey?: string,
): Promise<HostedRemoteSession> {
  if (accessToken.trim().length >= 32) {
    await ensureHostedAccessTokenReady(relayUrl, accessToken, relaySecretKey);
  }
  const res = await relayFetchWithAccessToken(
    relayUrl,
    accessToken,
    `/v1/computers/${encodeURIComponent(serverId)}/client_sessions`,
    { method: 'POST', body: JSON.stringify({ client_kind: 'web' }) },
    relaySecretKey,
  );
  const data = (await res.json().catch(() => null)) as Partial<HostedRemoteSession> & {
    error?: string;
  } | null;
  if (!res.ok || !data?.ws_url || !data?.gateway_url || !data?.client_token) {
    throw new Error(data?.error ?? runtimeT('hostedConnection.errors.couldNotConnectComputer'));
  }
  const session = {
    ws_url: data.ws_url,
    gateway_url: data.gateway_url,
    client_token: data.client_token,
  };
  try {
    await fetchRelayRuntimeInfo(session.gateway_url, session.client_token);
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? runtimeT('hostedConnection.errors.remoteRelayUnreachableWithReason', {
            message: err.message,
          })
        : runtimeT('hostedConnection.errors.remoteRelayUnreachable'),
    );
  }
  return session;
}

export function readHostedConnectionPreference(): HostedConnectionPreference | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(HOSTED_CONNECTION_PREF_KEY);
  return raw === 'local' || raw === 'relay' ? raw : null;
}

export function writeHostedConnectionPreference(target: HostedConnectionPreference): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(HOSTED_CONNECTION_PREF_KEY, target);
}
