/** Hub device credential length gate — shared with Relay client. */
export {
  isPlausibleDeviceCredential,
  MIN_DEVICE_CREDENTIAL_LEN,
  requireDeviceCredential,
} from "@atmos/relay-client";

import { isPlausibleDeviceCredential } from "@atmos/relay-client";

/** @deprecated use isPlausibleDeviceCredential */
export function isPlausibleAccessToken(token: string) {
  return isPlausibleDeviceCredential(token);
}
