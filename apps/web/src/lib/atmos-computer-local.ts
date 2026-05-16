/**
 * Loopback-only helpers for the machine running this browser's Atmos Server.
 */

import { systemApi } from '@/api/rest-api';
import { getLoopbackHttpBase, isTauriRuntime } from '@/lib/desktop-runtime';
import type { ShellEnvInfo } from '@/api/rest-api';

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
  control_plane_url: string;
  relay_ws_url: string | null;
  shell_env?: ShellEnvInfo;
}

const DEFAULT_CONTROL_PLANE = 'https://relay.atmos.land';

interface ApiEnvelope {
  success?: boolean;
  data?: unknown;
  message?: string;
  error?: string;
}

function stripLocalSuffix(hostname: string | null | undefined): string | null {
  if (!hostname?.trim()) {
    return null;
  }
  const trimmed = hostname.trim();
  const stripped = trimmed.replace(/\.local$/i, '');
  return stripped || trimmed;
}

async function tauriComputerDisplayName(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const invoke = (
    window as {
      __TAURI_INTERNALS__?: { invoke?: (cmd: string) => Promise<string | null> };
    }
  ).__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    return null;
  }
  try {
    const name = await invoke('get_local_computer_display_name');
    const trimmed = name?.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

async function localFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = (await getLoopbackHttpBase()).replace(/\/$/, '');
  const token =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_TOKEN : undefined;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) {
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
    tauriComputerDisplayName(),
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
    control_plane_url: DEFAULT_CONTROL_PLANE,
    relay_ws_url: null,
    shell_env: overview?.shell_env,
  };
}

export async function fetchLocalComputerStatus(): Promise<LocalComputerStatus> {
  return localFetch<LocalComputerStatus>('/api/system/computer');
}

export async function registerLocalComputer(
  registerToken: string,
  displayName: string,
): Promise<{
  server_id: string;
  display_name: string;
  relay_connected?: boolean;
  relay_last_error?: string | null;
}> {
  return localFetch('/api/system/computer/register', {
    method: 'POST',
    body: JSON.stringify({
      register_token: registerToken,
      display_name: displayName,
    }),
  });
}

export async function unregisterLocalComputer(): Promise<{ removed: boolean; hint?: string }> {
  return localFetch('/api/system/computer/unregister', { method: 'POST', body: '{}' });
}

export interface RelaySyncResult {
  relay_connected: boolean;
  relay_last_error?: string | null;
}

/** Ask the local API to (re)open the outbound relay WebSocket from disk identity. */
export async function syncRelayConnection(): Promise<RelaySyncResult> {
  return localFetch<RelaySyncResult>('/api/system/computer/relay-sync', {
    method: 'POST',
    body: '{}',
  });
}
