import { getRandomBytes } from "expo-crypto";

/**
 * Hermes does not expose Web Crypto. Noble (Relay hop E2EE) needs
 * `crypto.getRandomValues`. Install the native CSPRNG before any seal.
 */
type CryptoFill = {
  getRandomValues: (array: ArrayBufferView) => ArrayBufferView;
};

const holder = globalThis as typeof globalThis & { crypto?: CryptoFill };

function fillRandom(array: ArrayBufferView): ArrayBufferView {
  const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  view.set(getRandomBytes(array.byteLength));
  return array;
}

if (!holder.crypto) {
  holder.crypto = { getRandomValues: fillRandom };
} else if (typeof holder.crypto.getRandomValues !== "function") {
  holder.crypto.getRandomValues = fillRandom;
}
