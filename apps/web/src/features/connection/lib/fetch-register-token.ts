import type { RegisterTokenResponse } from "@atmos/relay-client";
import { getWebRelayClient } from "@/features/connection/lib/create-web-relay-client";

export type { RegisterTokenResponse };

export async function fetchRegisterToken(
  relayUrl: string,
  accessToken: string,
  relaySecretKey?: string,
): Promise<RegisterTokenResponse> {
  return getWebRelayClient({ relayUrl, relaySecretKey })
    .withDeviceCredential(accessToken)
    .createRegisterToken();
}
