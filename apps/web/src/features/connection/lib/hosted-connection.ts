'use client';

import { createTranslator } from 'next-intl';
import {
  isPlausibleDeviceCredential,
  type ComputerRow,
  type RelayClientKind,
} from '@atmos/relay-client';
import { fetchRelayRuntimeInfo } from '@/api/relay';
import { getWebRelayClient } from '@/features/connection/lib/create-web-relay-client';
import { workbenchRelayClientKind } from '@/features/connection/lib/workbench-relay-client-kind';
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  terminal_ws_url: string;
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
  _relayUrl: string,
  accessToken: string,
  _relaySecretKey?: string,
): Promise<void> {
  const token = accessToken.trim();
  if (!isPlausibleDeviceCredential(token)) {
    throw new Error(runtimeT('hostedConnection.errors.accessKeyTooShort'));
  }
  // Device credentials are Hub-minted and projected to Relay — no local tenant register.
}

export async function listHostedRemoteComputers(
  relayUrl: string,
  accessToken: string,
  relaySecretKey?: string,
): Promise<ComputerRow[]> {
  if (accessToken.trim().length >= 32) {
    await ensureHostedAccessTokenReady(relayUrl, accessToken, relaySecretKey);
  }
  return getWebRelayClient({ relayUrl, relaySecretKey })
    .withDeviceCredential(accessToken)
    .listComputers();
}

export async function createHostedRemoteSession(
  relayUrl: string,
  accessToken: string,
  serverId: string,
  relaySecretKey?: string,
  /**
   * Defaults to desktop when running in Electron, web otherwise.
   * Mobile does not use this path.
   */
  clientKind: Extract<RelayClientKind, 'web' | 'desktop'> = workbenchRelayClientKind(),
): Promise<HostedRemoteSession> {
  if (accessToken.trim().length >= 32) {
    await ensureHostedAccessTokenReady(relayUrl, accessToken, relaySecretKey);
  }
  let session: HostedRemoteSession;
  try {
    session = await getWebRelayClient({ relayUrl, relaySecretKey })
      .withDeviceCredential(accessToken)
      .createClientSession(serverId, { clientKind });
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? err.message
        : runtimeT('hostedConnection.errors.couldNotConnectComputer'),
    );
  }
  // After Relay session: probe Computer via gateway HTTP (app concern, not relay-client).
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
