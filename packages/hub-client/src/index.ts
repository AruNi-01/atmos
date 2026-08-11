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
export {
  applyHubAuthToHeaders,
  getHubAuthMaterial,
  getHubSessionCookieProvider,
  hasHubAuthMaterial,
  hubAuthWire,
  setHubSessionCookieProvider,
  withHubAuth,
  type HubAuthMaterial,
  type HubAuthWire,
} from "./auth-material";
export { hubMe } from "./me";
export { hubEnrollDevice, hubListDevices, hubRevokeDevice } from "./devices";
export { hubEnrollAndStoreDevice } from "./enroll";
export {
  hubClaimMobilePair,
  hubCreateMobilePair,
  parseMobilePairScan,
  type MobilePairClaimResponse,
  type MobilePairCreateResponse,
} from "./mobile-pair";
export {
  hubLinearConnectApiKey,
  hubLinearDisconnect,
  hubLinearStatus,
} from "./integrations/linear";
export {
  clearStoredDeviceCredential,
  getDeviceCredentialStore,
  getStoredDeviceCredential,
  getStoredDeviceRecord,
  setDeviceCredentialStore,
  storeDeviceCredential,
} from "./device-storage/registry";
export type { DeviceCredentialStore } from "./device-storage/types";
export type {
  HubDeviceEnrollResponse,
  HubDeviceRow,
  HubLinearStatus,
  HubMe,
  StoredDeviceCredential,
} from "./types";
