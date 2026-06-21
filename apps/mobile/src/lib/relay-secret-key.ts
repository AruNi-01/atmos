import * as SecureStore from "expo-secure-store";

const RELAY_SECRET_KEY = "atmos.relay_secret_key";

export async function getStoredRelaySecretKey() {
  return SecureStore.getItemAsync(RELAY_SECRET_KEY);
}

export async function storeRelaySecretKey(secretKey: string) {
  const trimmed = secretKey.trim();
  if (!trimmed) {
    await clearRelaySecretKey();
    return;
  }

  await SecureStore.setItemAsync(RELAY_SECRET_KEY, trimmed);
}

export async function clearRelaySecretKey() {
  await SecureStore.deleteItemAsync(RELAY_SECRET_KEY);
}
