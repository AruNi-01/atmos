'use client';

import type { ComputerRow } from '@/lib/connection-ui-prefs';
import { cpFetchWithAccessToken, registerAccessTokenOnRelay } from '@/lib/atmos-access-token';
import {
  getHostedLoopbackCandidates,
  httpBase,
  type ApiConfig,
} from '@/lib/desktop-runtime';
import type { LocalComputerStatus } from '@/lib/atmos-computer-local';

const HOSTED_CONNECTION_PREF_KEY = 'atmos:v1:hosted:last-target';

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
    return 'Cannot reach Atmos Server on this computer.';
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
          ? 'Computer API is not available on this Atmos Server.'
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
  controlPlaneUrl: string,
  accessToken: string,
): Promise<void> {
  const token = accessToken.trim();
  if (token.length < 32) {
    throw new Error('Access key is too short.');
  }
  const result = await registerAccessTokenOnRelay(controlPlaneUrl, token);
  if (!result.ok) {
    throw new Error(result.error ?? 'Could not save access key.');
  }
}

export async function listHostedRemoteComputers(
  controlPlaneUrl: string,
  accessToken: string,
): Promise<ComputerRow[]> {
  await ensureHostedAccessTokenReady(controlPlaneUrl, accessToken);
  const res = await cpFetchWithAccessToken(controlPlaneUrl, accessToken, '/v1/computers');
  const data = (await res.json().catch(() => null)) as { computers?: ComputerRow[]; error?: string } | null;
  if (!res.ok) {
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  return data?.computers ?? [];
}

export async function createHostedRemoteSession(
  controlPlaneUrl: string,
  accessToken: string,
  serverId: string,
): Promise<HostedRemoteSession> {
  await ensureHostedAccessTokenReady(controlPlaneUrl, accessToken);
  const res = await cpFetchWithAccessToken(
    controlPlaneUrl,
    accessToken,
    `/v1/computers/${encodeURIComponent(serverId)}/client_sessions`,
    { method: 'POST', body: JSON.stringify({ client_kind: 'web' }) },
  );
  const data = (await res.json().catch(() => null)) as Partial<HostedRemoteSession> & {
    error?: string;
  } | null;
  if (!res.ok || !data?.ws_url || !data?.gateway_url || !data?.client_token) {
    throw new Error(data?.error ?? 'Could not connect to that computer.');
  }
  return {
    ws_url: data.ws_url,
    gateway_url: data.gateway_url,
    client_token: data.client_token,
  };
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
