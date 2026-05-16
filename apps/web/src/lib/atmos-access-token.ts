/**
 * User access token helpers (APP-016) — possession = tenant, no account login.
 */

import { isTauriRuntime } from '@/lib/desktop-runtime';
import { resolveControlPlaneUrl } from '@/lib/atmos-computer-store';

export function generateAccessToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const b of raw) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface RelayHttpResult {
  status: number;
  body: string;
}

function formatFetchError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'Load failed' || message.includes('Failed to fetch')) {
    return 'Cannot reach the control plane (relay.atmos.land). Check your network connection.';
  }
  return message;
}

async function relayHttpViaTauri(
  controlPlaneUrl: string,
  method: string,
  path: string,
  accessToken?: string,
  body?: string,
): Promise<RelayHttpResult> {
  const invoke = (
    window as {
      __TAURI_INTERNALS__?: {
        invoke?: <T>(cmd: string, args: Record<string, unknown>) => Promise<T>;
      };
    }
  ).__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    throw new Error('Desktop runtime is not ready');
  }
  return invoke<RelayHttpResult>('relay_http_request', {
    req: {
      control_plane_url: controlPlaneUrl,
      method,
      path,
      access_token: accessToken?.trim() || null,
      body: body ?? null,
    },
  });
}

/** Register token hash on the control plane (idempotent on 409). */
export async function registerAccessTokenOnRelay(
  controlPlaneUrl: string,
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = resolveControlPlaneUrl(controlPlaneUrl);
  const payload = JSON.stringify({ token: accessToken.trim() });

  if (isTauriRuntime()) {
    try {
      const res = await relayHttpViaTauri(base, 'POST', '/v1/tenants', undefined, payload);
      if (res.status === 201 || res.status === 409) {
        return { ok: true };
      }
      try {
        const data = JSON.parse(res.body) as { error?: string };
        return { ok: false, error: data.error ?? `HTTP ${res.status}` };
      } catch {
        return { ok: false, error: `HTTP ${res.status}` };
      }
    } catch (err) {
      return { ok: false, error: formatFetchError(err) };
    }
  }

  try {
    const res = await fetch(`${base}/v1/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

export async function cpFetchWithAccessToken(
  controlPlaneUrl: string,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = resolveControlPlaneUrl(controlPlaneUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const method = (init?.method ?? 'GET').toUpperCase();
  const body =
    typeof init?.body === 'string'
      ? init.body
      : init?.body != null
        ? JSON.stringify(init.body)
        : undefined;

  if (isTauriRuntime()) {
    const res = await relayHttpViaTauri(
      base,
      method,
      normalizedPath,
      accessToken,
      body,
    );
    return new Response(res.body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = `${base}${normalizedPath}`;
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${accessToken.trim()}`);
  return fetch(url, {
    ...init,
    method,
    headers,
    body: init?.body,
  });
}
