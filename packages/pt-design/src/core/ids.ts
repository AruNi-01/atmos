function hexFromBytes(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** Prefer `crypto.randomUUID`. Fall back when it is missing (some HTTP / WebView hosts). */
function randomHex(byteLength: number): string {
  const web = globalThis.crypto;
  if (typeof web?.randomUUID === "function") {
    return web.randomUUID().replaceAll("-", "");
  }
  const buf = new Uint8Array(byteLength);
  if (typeof web?.getRandomValues === "function") {
    web.getRandomValues(buf);
  } else {
    for (let i = 0; i < byteLength; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }
  return hexFromBytes(buf);
}

export function createId(prefix = "el"): string {
  return `${prefix}_${randomHex(16).slice(0, 16)}`;
}

export function createInstanceId(): string {
  return `inst_${randomHex(16)}`;
}
