/**
 * Web app bootstrap for @atmos/hub-client.
 * Side-effect import once early so device store + base URL are ready before UI calls.
 */
import {
  configureHubClient,
  setDeviceCredentialStore,
} from "@atmos/hub-client";
import { createBrowserDeviceCredentialStore } from "@atmos/hub-client/device-storage/browser";

const hubUrl =
  process.env.NEXT_PUBLIC_ATMOS_HUB_URL?.trim() ||
  process.env.ATMOS_HUB_URL?.trim() ||
  "";

configureHubClient({ baseUrl: hubUrl });
setDeviceCredentialStore(createBrowserDeviceCredentialStore());
