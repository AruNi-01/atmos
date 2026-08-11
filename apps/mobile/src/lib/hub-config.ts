/**
 * Mobile Hub bootstrap: base URL + SecureStore DeviceCredentialStore only.
 * No cookie provider — App identity is device Bearer exclusively.
 */
import {
  configureHubClient,
  setDeviceCredentialStore,
  type DeviceCredentialStore,
  type StoredDeviceCredential,
} from "@atmos/hub-client";
import * as SecureStore from "expo-secure-store";

const RECORD_KEY = "atmos.hub.device_record";

let configured = false;
let flushChain: Promise<void> = Promise.resolve();

function createSecureDeviceStore(): DeviceCredentialStore {
  let memory: StoredDeviceCredential | null = null;

  const persist = (next: StoredDeviceCredential | null) => {
    flushChain = flushChain
      .then(async () => {
        if (!next) {
          await SecureStore.deleteItemAsync(RECORD_KEY).catch(() => undefined);
          return;
        }
        await SecureStore.setItemAsync(RECORD_KEY, JSON.stringify(next));
      })
      .catch(() => undefined);
  };

  return {
    get() {
      return memory?.device_credential ?? null;
    },
    getRecord() {
      return memory;
    },
    set(payload) {
      memory = {
        device_id: payload.device_id || "device",
        device_credential: payload.device_credential,
        enrolled_at: Date.now(),
      };
      persist(memory);
    },
    clear() {
      memory = null;
      persist(null);
    },
  };
}

/** Wait for pending SecureStore writes (call before process exit / tests if needed). */
export async function flushDeviceCredentialStore(): Promise<void> {
  await flushChain;
}

export function getDefaultHubUrl(): string {
  return (
    process.env.EXPO_PUBLIC_ATMOS_HUB_URL?.trim() || "https://hub.atmos.land"
  );
}

/** Bootstrap Hub client once for the mobile process. */
export async function ensureMobileHubConfigured(): Promise<void> {
  if (configured) return;
  configureHubClient({ baseUrl: getDefaultHubUrl() });
  const store = createSecureDeviceStore();

  const raw = await SecureStore.getItemAsync(RECORD_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredDeviceCredential;
      if (
        typeof parsed.device_credential === "string" &&
        parsed.device_credential.length >= 32
      ) {
        store.set({
          device_id: parsed.device_id || "device",
          device_credential: parsed.device_credential,
        });
      }
    } catch {
      /* corrupt — ignore */
    }
  }

  setDeviceCredentialStore(store);
  configured = true;
}
