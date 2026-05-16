import { cpFetchWithAccessToken } from '@/lib/atmos-access-token';

export interface RegisterTokenResponse {
  register_token: string;
  expires_at: number;
  register_command?: string;
}

export async function fetchRegisterToken(
  controlPlaneUrl: string,
  accessToken: string,
): Promise<RegisterTokenResponse> {
  const res = await cpFetchWithAccessToken(controlPlaneUrl, accessToken, '/v1/register_tokens', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const data = (await res.json().catch(() => null)) as
    | (RegisterTokenResponse & { error?: string })
    | null;
  if (!res.ok || !data?.register_token) {
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  return {
    register_token: data.register_token,
    expires_at: data.expires_at,
    register_command: data.register_command,
  };
}
