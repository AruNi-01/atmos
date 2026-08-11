/**
 * Hub device credential helpers for Relay (APP-056).
 * Prefer `createWebRelayClient` for Relay REST.
 */

export {
  isPlausibleDeviceCredential,
  MIN_DEVICE_CREDENTIAL_LEN,
} from '@atmos/relay-client';

import { isPlausibleDeviceCredential } from '@atmos/relay-client';

/** @deprecated Access Token model removed — same as isPlausibleDeviceCredential. */
export function isPlausibleAccessToken(token: string): boolean {
  return isPlausibleDeviceCredential(token);
}
