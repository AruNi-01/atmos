import { ENCRYPTION_KEY_BITS, IV_LENGTH_BYTES } from "./constants";

function subtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) throw new Error("Web Crypto is required for collaboration");
  return cryptoObj.subtle;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function createIV(): Uint8Array {
  return randomBytes(IV_LENGTH_BYTES);
}

export async function generateEncryptionKey(): Promise<string> {
  const key = await subtle().generateKey(
    { name: "AES-GCM", length: ENCRYPTION_KEY_BITS },
    true,
    ["encrypt", "decrypt"],
  );
  const jwk = await subtle().exportKey("jwk", key);
  if (!jwk.k) throw new Error("Could not export collaboration key");
  return jwk.k;
}

async function importKey(key: string, usage: KeyUsage): Promise<CryptoKey> {
  return subtle().importKey(
    "jwk",
    {
      alg: "A128GCM",
      ext: true,
      k: key,
      key_ops: ["encrypt", "decrypt"],
      kty: "oct",
    },
    { name: "AES-GCM", length: ENCRYPTION_KEY_BITS },
    false,
    [usage],
  );
}

export async function encryptData(
  key: string,
  data: Uint8Array | string,
): Promise<{ encryptedBuffer: ArrayBuffer; iv: Uint8Array }> {
  const imported = await importKey(key, "encrypt");
  const iv = createIV();
  const buffer = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const encryptedBuffer = await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource }, imported, buffer);
  return { encryptedBuffer, iv };
}

export async function decryptData(
  iv: Uint8Array,
  encrypted: Uint8Array | ArrayBuffer,
  key: string,
): Promise<ArrayBuffer> {
  const imported = await importKey(key, "decrypt");
  return subtle().decrypt({ name: "AES-GCM", iv: iv as BufferSource }, imported, encrypted);
}
