/**
 * Web app bootstrap for @atmos/hub-client.
 * Side-effect import once early so device store + base URL + cookie provider
 * are ready before UI calls. Runtime adapters only — request code uses
 * getHubAuthMaterial / hubFetch / withHubAuth.
 */
import {
  configureHubClient,
  setDeviceCredentialStore,
  setHubSessionCookieProvider,
} from "@atmos/hub-client";
import {
  createBrowserDeviceCredentialStore,
  hubCookieFromDocument,
} from "@atmos/hub-client/device-storage/browser";

const hubUrl =
  process.env.NEXT_PUBLIC_ATMOS_HUB_URL?.trim() ||
  process.env.ATMOS_HUB_URL?.trim() ||
  "";

configureHubClient({ baseUrl: hubUrl });
setDeviceCredentialStore(createBrowserDeviceCredentialStore());
setHubSessionCookieProvider(hubCookieFromDocument);
