import type {
  GhCliStatusResponse,
  RuntimeInfoResponse,
  TerminalOverviewResponse,
} from '@/api/rest-api';

async function fetchRelaySystemJson<T>(
  relayGatewayHttpBase: string,
  relayClientToken: string,
  path: string,
): Promise<T> {
  const base = relayGatewayHttpBase.replace(/\/$/, '');
  const token =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_TOKEN : undefined;
  const headers = new Headers({
    Authorization: `Bearer ${relayClientToken}`,
  });
  if (token) {
    headers.set('X-Atmos-Local-Token', token);
  }
  const res = await fetch(`${base}${path}`, { headers });
  const json = (await res.json().catch(() => null)) as {
    data?: T;
    error?: string;
    message?: string;
  } | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.error ?? json?.message ?? `HTTP ${res.status}`);
  }
  return json.data;
}

/** Fetch terminal overview through an active relay gateway session. */
export async function fetchRelayTerminalOverview(
  relayGatewayHttpBase: string,
  relayClientToken: string,
): Promise<TerminalOverviewResponse> {
  return fetchRelaySystemJson<TerminalOverviewResponse>(
    relayGatewayHttpBase,
    relayClientToken,
    '/api/system/terminal-overview',
  );
}

/** Fetch runtime info through an active relay gateway session. */
export async function fetchRelayRuntimeInfo(
  relayGatewayHttpBase: string,
  relayClientToken: string,
): Promise<RuntimeInfoResponse> {
  return fetchRelaySystemJson<RuntimeInfoResponse>(
    relayGatewayHttpBase,
    relayClientToken,
    '/api/system/runtime-info',
  );
}

/** Fetch GitHub CLI status through an active relay gateway session. */
export async function fetchRelayGhCliStatus(
  relayGatewayHttpBase: string,
  relayClientToken: string,
): Promise<GhCliStatusResponse> {
  return fetchRelaySystemJson<GhCliStatusResponse>(
    relayGatewayHttpBase,
    relayClientToken,
    '/api/system/gh-cli-status',
  );
}
