import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
export { isPlausibleAccessToken } from "@/lib/access-token-format";

const ACCESS_TOKEN_KEY = "atmos.access_token";

export async function getStoredAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function storeAccessToken(token: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function clearAccessToken() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

export async function generateAccessToken() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
