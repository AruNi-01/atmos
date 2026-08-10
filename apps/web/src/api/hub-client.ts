/**
 * Web re-export surface for Atmos Hub control-plane client.
 * Implementation lives in `@atmos/hub-client` (shared with mobile later).
 *
 * Importing this module also runs hub bootstrap (base URL + browser device store).
 */
import "@/api/hub-bootstrap";

import {
  hubAuthForLocalApi as hubAuthForLocalApiCore,
  type HubAuthForLocalApi,
} from "@atmos/hub-client";
import { hubCookieFromDocument } from "@atmos/hub-client/device-storage/browser";

export {
  clearStoredDeviceCredential,
  configureHubClient,
  getDeviceCredentialStore,
  getStoredDeviceCredential,
  hubBaseUrl,
  hubConfigured,
  hubEnrollAndStoreDevice,
  hubEnrollDevice,
  hubFetch,
  hubLinearConnectApiKey,
  hubLinearDisconnect,
  hubLinearStatus,
  hubListDevices,
  hubMe,
  requireHubBaseUrl,
  setDeviceCredentialStore,
  storeDeviceCredential,
  type DeviceCredentialStore,
  type HubAuthForLocalApi,
  type HubClientConfig,
  type HubDeviceEnrollResponse,
  type HubDeviceRow,
  type HubLinearStatus,
  type HubMe,
  type StoredDeviceCredential,
} from "@atmos/hub-client";

export { hubCookieFromDocument } from "@atmos/hub-client/device-storage/browser";

/** Browser: include readable cookies (dev) + stored device credential. */
export function hubAuthForLocalApi(): HubAuthForLocalApi {
  return hubAuthForLocalApiCore(hubCookieFromDocument);
}
