import { hubEnrollDevice } from "./devices";
import { storeDeviceCredential } from "./device-storage/registry";
import type { HubDeviceEnrollResponse } from "./types";

/**
 * Enroll a device on Hub and persist the one-time credential into the
 * configured platform store (browser localStorage / future SecureStore).
 */
export async function hubEnrollAndStoreDevice(opts?: {
  label?: string;
  app_device_id?: string;
}): Promise<HubDeviceEnrollResponse> {
  const enrolled = await hubEnrollDevice(opts);
  storeDeviceCredential({
    device_id: enrolled.device_id,
    device_credential: enrolled.device_credential,
  });
  return enrolled;
}
