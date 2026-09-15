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
import { resolveWebHubUrl } from "@/api/hub-url";

configureHubClient({ baseUrl: resolveWebHubUrl() });
setDeviceCredentialStore(createBrowserDeviceCredentialStore());
setHubSessionCookieProvider(hubCookieFromDocument);
