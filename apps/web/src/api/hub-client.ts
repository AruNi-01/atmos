/**
 * Web re-export surface for Atmos Hub control-plane client.
 * Implementation lives in `@atmos/hub-client` (shared with mobile later).
 *
 * Importing this module also runs hub bootstrap (base URL + browser device store
 * + session cookie provider).
 */
import "@/api/hub-bootstrap";

export {
  applyHubAuthToHeaders,
  clearStoredDeviceCredential,
  configureHubClient,
  getDeviceCredentialStore,
  getHubAuthMaterial,
  getStoredDeviceCredential,
  hasHubAuthMaterial,
  hubAuthWire,
  hubBaseUrl,
  hubConfigured,
  hubCreateMobilePair,
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
  setHubSessionCookieProvider,
  storeDeviceCredential,
  withHubAuth,
  type DeviceCredentialStore,
  type HubAuthMaterial,
  type HubAuthWire,
  type HubClientConfig,
  type HubDeviceEnrollResponse,
  type HubDeviceRow,
  type HubLinearStatus,
  type HubMe,
  type MobilePairCreateResponse,
  type StoredDeviceCredential,
} from "@atmos/hub-client";

export { hubCookieFromDocument } from "@atmos/hub-client/device-storage/browser";
