/**
 * User access token helpers (APP-016) — possession = tenant, no account login.
 */

import { resolveControlPlaneUrl } from '@/lib/atmos-computer-store';

export function generateAccessToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const b of raw) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Register token hash on the control plane (idempotent on 409). */
export async function registerAccessTokenOnRelay(
  controlPlaneUrl: string,
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = resolveControlPlaneUrl(controlPlaneUrl);

  try {
    const res = await fetch(`${base}/v1/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: accessToken.trim() }),
    });

    if (res.status === 201 || res.status === 409) {
      return { ok: true };
    }

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function cpFetchWithAccessToken(
  controlPlaneUrl: string,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = resolveControlPlaneUrl(controlPlaneUrl);
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken.trim()}`,
      ...(init?.headers ?? {}),
    },
  });
}
