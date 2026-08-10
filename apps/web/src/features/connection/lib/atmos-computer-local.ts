/**
 * Loopback-only helpers for the machine running this browser's Atmos Server.
 */

import { systemApi } from '@/api/rest-api';
import { desktopInvoke, isDesktopRuntime } from '@/shared/lib/desktop-bridge';
import {
  getLoopbackHttpBase,
  isHostedAtmosOrigin,
} from '@/shared/lib/desktop-runtime';
import type { ShellEnvInfo } from '@/api/rest-api';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';

export interface LocalComputerStatus {
  hostname: string | null;
  /** Friendly device name (e.g. macOS ComputerName from scutil). */
  computer_name: string | null;
  registered: boolean;
  /** Outbound WSS to Cloudflare relay is active on this API process. */
  relay_connected: boolean;
  /** Last relay connect failure from the local API, if any. */
  relay_last_error?: string | null;
  server_id: string | null;
  relay_url: string;
  relay_ws_url: string | null;
  shell_env?: ShellEnvInfo;
}

const DEFAULT_RELAY = 'https://relay.atmos.land';
const LOCAL_COMPUTER_STATUS_CACHE_MS = 1_500;

interface ApiEnvelope {
  success?: boolean;
  data?: unknown;
  message?: string;
  error?: string;
}

type LocalComputerStatusCache = {
  expiresAt: number;
  key: string;
  status: LocalComputerStatus;
};

let localComputerStatusCache: LocalComputerStatusCache | null = null;
let localComputerStatusInFlight:
  | { key: string; request: Promise<LocalComputerStatus> }
  | null = null;
let localComputerStatusCacheEpoch = 0;

function getLocalComputerStatusCacheKey(): string {
  const computer = useAtmosComputerStore.getState();
  if (
    isHostedAtmosOrigin() &&
    computer.connectionMode === 'relay' &&
    computer.relayGatewayHttpBase &&
    computer.relayClientToken
  ) {
    return [
      'relay',
      computer.relayGatewayHttpBase.replace(/\/$/, ''),
      computer.relayClientToken,
    ].join(':');
  }
  return 'loopback';
}

export function invalidateLocalComputerStatusCache(): void {
  localComputerStatusCacheEpoch += 1;
  localComputerStatusCache = null;
  localComputerStatusInFlight = null;
}

function stripLocalSuffix(hostname: string | null | undefined): string | null {
  if (!hostname?.trim()) {
    return null;
  }
  const trimmed = hostname.trim();
  const stripped = trimmed.replace(/\.local$/i, '');
  return stripped || trimmed;
}

async function desktopComputerDisplayName(): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null;
  }
  try {
    const name = await desktopInvoke<string | null>(
      'get_local_computer_display_name',
    );
    const trimmed = name?.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

async function localFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const computer = useAtmosComputerStore.getState();
  const usingRelayGateway =
    isHostedAtmosOrigin() &&
    computer.connectionMode === 'relay' &&
    Boolean(computer.relayGatewayHttpBase && computer.relayClientToken);
  const base = usingRelayGateway
    ? computer.relayGatewayHttpBase!.replace(/\/$/, '')
    : (await getLoopbackHttpBase()).replace(/\/$/, '');
  const token =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_TOKEN : undefined;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (usingRelayGateway && computer.relayClientToken) {
    headers.Authorization = `Bearer ${computer.relayClientToken}`;
  } else if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers });
  } catch (err) {
    const hint =
      ' Make sure Atmos Server is running. After updating the app, restart it (e.g. just dev-api).';
    throw new Error(`Cannot reach Atmos Server at ${base}.${hint}`, { cause: err });
  }

  const raw = await res.text();
  let json: ApiEnvelope | null = null;
  try {
    json = JSON.parse(raw) as ApiEnvelope;
  } catch {
    if (raw.trimStart().startsWith('<!') || res.status === 405) {
      throw new Error(
        'Computer API is not available on this Atmos Server — restart Atmos Server to load the latest API.',
      );
    }
  }
  if (!res.ok || !json?.success) {
    if (res.status === 405) {
      throw new Error(
        'Computer API is not available on this Atmos Server — restart Atmos Server to load the latest API.',
      );
    }
    throw new Error(json?.error ?? json?.message ?? `HTTP ${res.status}`);
  }
  return json.data as T;
}

/** Load status from `/api/system/computer`, with display-name fallbacks when the route is missing. */
export async function loadLocalComputerStatus(
  knownServerId?: string | null,
): Promise<LocalComputerStatus | null> {
  try {
    return await fetchLocalComputerStatus();
  } catch {
    // Old API binaries fall through to the static SPA and return HTML for unknown routes.
  }

  const [tauriName, overview] = await Promise.all([
    desktopComputerDisplayName(),
    systemApi.getTerminalOverview().catch(() => null),
  ]);

  const hostname = overview?.shell_env?.hostname ?? null;
  const computer_name =
    tauriName ?? stripLocalSuffix(hostname) ?? hostname?.trim() ?? null;

  if (!computer_name && !knownServerId) {
    return null;
  }

  return {
    hostname,
    computer_name,
    registered: Boolean(knownServerId),
    relay_connected: false,
    relay_last_error: null,
    server_id: knownServerId ?? null,
    relay_url: DEFAULT_RELAY,
    relay_ws_url: null,
    shell_env: overview?.shell_env,
  };
}

export async function fetchLocalComputerStatus(): Promise<LocalComputerStatus> {
  const key = getLocalComputerStatusCacheKey();
  const now = Date.now();
  if (
    localComputerStatusCache &&
    localComputerStatusCache.key === key &&
    localComputerStatusCache.expiresAt > now
  ) {
    return localComputerStatusCache.status;
  }
  if (localComputerStatusInFlight?.key === key) {
    return localComputerStatusInFlight.request;
  }

  const cacheEpoch = localComputerStatusCacheEpoch;
  const request = localFetch<LocalComputerStatus>('/api/system/computer')
    .then((status) => {
      if (cacheEpoch === localComputerStatusCacheEpoch) {
        localComputerStatusCache = {
          key,
          status,
          expiresAt: Date.now() + LOCAL_COMPUTER_STATUS_CACHE_MS,
        };
      }
      return status;
    })
    .finally(() => {
      if (localComputerStatusInFlight?.request === request) {
        localComputerStatusInFlight = null;
      }
    });
  localComputerStatusInFlight = { key, request };
  return request;
}

export async function registerLocalComputer(
  registerToken: string,
  displayName: string,
  relayUrl?: string,
  relaySecretKey?: string,
  registrationMeta?: Record<string, unknown>,
): Promise<{
  server_id: string;
  display_name: string;
  relay_connected?: boolean;
  relay_last_error?: string | null;
}> {
  const result = await localFetch<{
    server_id: string;
    display_name: string;
    relay_connected?: boolean;
    relay_last_error?: string | null;
  }>('/api/system/computer/register', {
    method: 'POST',
    body: JSON.stringify({
      register_token: registerToken,
      display_name: displayName,
      relay_url: relayUrl?.trim() || null,
      relay_secret_key: relaySecretKey?.trim() || null,
      ...(registrationMeta ? { registration_meta: registrationMeta } : {}),
    }),
  });
  invalidateLocalComputerStatusCache();
  return result;
}

export async function unregisterLocalComputer(): Promise<{ removed: boolean; hint?: string }> {
  const result = await localFetch<{ removed: boolean; hint?: string }>(
    '/api/system/computer/unregister',
    { method: 'POST', body: '{}' },
  );
  invalidateLocalComputerStatusCache();
  return result;
}

export interface RelaySyncResult {
  relay_connected: boolean;
  relay_last_error?: string | null;
}

/** Ask the local API to (re)open the outbound relay WebSocket from disk identity. */
export async function syncRelayConnection(): Promise<RelaySyncResult> {
  const result = await localFetch<RelaySyncResult>('/api/system/computer/relay-sync', {
    method: 'POST',
    body: '{}',
  });
  invalidateLocalComputerStatusCache();
  return result;
}

export interface RelayProxyResult {
  status: number;
  body: string;
}

/**
 * Proxy relay HTTPS via loopback Atmos Server (Desktop + local browser).
 * Returns null when the local API is unreachable — caller may fall back to direct fetch.
 */
export async function proxyRelayRequest(
  relayUrl: string,
  method: string,
  path: string,
  opts?: {
    deviceCredential?: string;
    /** @deprecated use deviceCredential */
    accessToken?: string;
    body?: string;
    relaySecretKey?: string;
  },
): Promise<RelayProxyResult | null> {
  try {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const deviceCredential =
      opts?.deviceCredential?.trim() || opts?.accessToken?.trim() || null;
    return await localFetch<RelayProxyResult>('/api/system/computer/relay', {
      method: 'POST',
      body: JSON.stringify({
        relay_url: relayUrl.replace(/\/+$/, ''),
        method: method.toUpperCase(),
        path: normalizedPath,
        device_credential: deviceCredential,
        relay_secret_key: opts?.relaySecretKey?.trim() || null,
        body: opts?.body ?? null,
      }),
    });
  } catch {
    return null;
  }
}
