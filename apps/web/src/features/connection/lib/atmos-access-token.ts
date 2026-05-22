/**
 * User access token helpers (APP-016) — possession = tenant, no account login.
 */

import { proxyControlPlaneRequest } from '@/features/connection/lib/atmos-computer-local';
import { resolveControlPlaneUrl } from '@/features/connection/lib/atmos-computer-store';
import { isTauriRuntime } from '@/shared/lib/desktop-runtime';

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
    return 'Cannot reach Atmos cloud. Check your network connection.';
  }
  return message;
}

/** Register token hash on the control plane (idempotent on 409). */
export async function registerAccessTokenOnRelay(
  controlPlaneUrl: string,
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = resolveControlPlaneUrl(controlPlaneUrl);
  const payload = JSON.stringify({ token: accessToken.trim() });

  try {
    const proxied = await proxyControlPlaneRequest(base, 'POST', '/v1/tenants', {
      body: payload,
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
        error:
          'Cannot connect locally. Restart Atmos and try again.',
      };
    }

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

  const proxied = await proxyControlPlaneRequest(base, method, normalizedPath, {
    accessToken,
    body,
  });
  if (proxied) {
    return new Response(proxied.body, {
      status: proxied.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isTauriRuntime()) {
    throw new Error('Cannot connect locally. Restart Atmos and try again.');
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
