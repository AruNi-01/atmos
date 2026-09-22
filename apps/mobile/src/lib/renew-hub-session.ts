import { clearStoredDeviceCredential, hubMe, type HubMe } from "@atmos/hub-client";
import { hasDeviceCredential } from "@/lib/device-credential";
import { hubSessionRenewalAction } from "@/lib/hub-session-renewal";
import { ensureMobileHubConfigured, flushDeviceCredentialStore } from "@/lib/hub-config";
import { useHubProfileStore } from "@/stores/hub-profile-store";
import { useSessionStore } from "@/stores/session-store";

/**
 * Confirm the device credential still works and refresh the cached profile.
 * Called when the app opens. Settings reads the cache and does not call Hub.
 */
export async function renewHubSession() {
  await ensureMobileHubConfigured();
  if (!hasDeviceCredential()) {
    useHubProfileStore.getState().clear();
    return;
  }

  let me: HubMe | null = null;
  let failed = false;
  try {
    me = await hubMe();
  } catch {
    failed = true;
  }

  const action = hubSessionRenewalAction(me, failed);
  if (action === "keep") return;
  if (action === "save" && me) {
    useHubProfileStore.getState().setProfile(me);
    return;
  }

  clearStoredDeviceCredential();
  await flushDeviceCredentialStore();
  useHubProfileStore.getState().clear();
  useSessionStore.getState().clearSession();
}
