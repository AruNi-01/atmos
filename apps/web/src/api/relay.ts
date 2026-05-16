import type { TerminalOverviewResponse } from '@/api/rest-api';

/** Fetch terminal overview through an active relay gateway session. */
export async function fetchRelayTerminalOverview(
  relayGatewayHttpBase: string,
  relayClientToken: string,
): Promise<TerminalOverviewResponse> {
  const base = relayGatewayHttpBase.replace(/\/$/, '');
  const token =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_TOKEN : undefined;
  const headers = new Headers({
    Authorization: `Bearer ${relayClientToken}`,
  });
  if (token) {
    headers.set('X-Atmos-Local-Token', token);
  }
  const res = await fetch(`${base}/api/system/terminal-overview`, { headers });
  const json = (await res.json().catch(() => null)) as {
    data?: TerminalOverviewResponse;
    error?: string;
    message?: string;
  } | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.error ?? json?.message ?? `HTTP ${res.status}`);
  }
  return json.data;
}
