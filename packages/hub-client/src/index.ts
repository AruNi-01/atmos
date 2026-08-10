/**
 * @atmos/hub-client — Atmos Hub control-plane HTTP client.
 * Use @atmos/api-client for main /ws; @atmos/relay-client for Relay REST.
 */

export {
  configureHubClient,
  hubBaseUrl,
  hubConfigured,
  requireHubBaseUrl,
  type HubClientConfig,
} from "./config";
export { hubFetch } from "./http";
export { hubMe } from "./me";
export { hubEnrollDevice, hubListDevices } from "./devices";
export { hubEnrollAndStoreDevice } from "./enroll";
export {
  hubLinearConnectApiKey,
  hubLinearDisconnect,
  hubLinearStatus,
} from "./integrations/linear";
export {
  clearStoredDeviceCredential,
  getDeviceCredentialStore,
  getStoredDeviceCredential,
  hubAuthForLocalApi,
  setDeviceCredentialStore,
  storeDeviceCredential,
} from "./device-storage/registry";
export type { DeviceCredentialStore } from "./device-storage/types";
export type {
  HubAuthForLocalApi,
  HubDeviceEnrollResponse,
  HubDeviceRow,
  HubLinearStatus,
  HubMe,
  StoredDeviceCredential,
} from "./types";
