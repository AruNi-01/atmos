import { getRandomBytes } from "expo-crypto";

/**
 * Hermes does not expose Web Crypto. Noble (Relay hop E2EE) needs
 * `crypto.getRandomValues`. Install the native CSPRNG before any seal.
 */
type CryptoFill = {
  getRandomValues: (array: ArrayBufferView) => ArrayBufferView;
  randomUUID?: () => string;
};

const holder = globalThis as typeof globalThis & { crypto?: CryptoFill };

function fillRandom(array: ArrayBufferView): ArrayBufferView {
  const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  view.set(getRandomBytes(array.byteLength));
  return array;
}

function randomUUID(): string {
  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

if (!holder.crypto) {
  holder.crypto = { getRandomValues: fillRandom, randomUUID };
} else {
  if (typeof holder.crypto.getRandomValues !== "function") {
    holder.crypto.getRandomValues = fillRandom;
  }
  if (typeof holder.crypto.randomUUID !== "function") {
    holder.crypto.randomUUID = randomUUID;
  }
}
