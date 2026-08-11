import {
  configureHubClient,
  hubClaimMobilePair,
  parseMobilePairScan,
  type HubMe,
} from "@atmos/hub-client";
import { acceptDeviceCredential } from "@/lib/device-credential";
import { ensureMobileHubConfigured, getDefaultHubUrl } from "@/lib/hub-config";

export async function claimPairFromScan(raw: string): Promise<{
  device_id: string;
  user_id: string;
  me: HubMe;
}> {
  await ensureMobileHubConfigured();
  const parsed = parseMobilePairScan(raw);
  if (!parsed) {
    throw new Error("Unrecognized QR code. Scan the pair code from Desktop/Web.");
  }

  const hub = parsed.hub?.trim() || getDefaultHubUrl();
  if (parsed.hub) {
    configureHubClient({ baseUrl: hub });
  }

  const claimed = await hubClaimMobilePair(parsed.code, { hubBase: hub });
  const me = await acceptDeviceCredential({
    device_id: claimed.device_id,
    device_credential: claimed.device_credential,
  });
  return {
    device_id: claimed.device_id,
    user_id: claimed.user_id,
    me,
  };
}
