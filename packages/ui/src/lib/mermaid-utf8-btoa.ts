const UTF8_BTOA_CHUNK = 0x8000;
let installed = false;

function utf8BinaryString(value: string): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= UTF8_BTOA_CHUNK) {
    return String.fromCharCode(...bytes);
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += UTF8_BTOA_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + UTF8_BTOA_CHUNK));
  }
  return binary;
}

function isNonLatin1BtoaError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.name === "InvalidCharacterError") return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /latin1 range|invalid characters/i.test(message);
}

/**
 * Mermaid dagre encodes edge points with `btoa(JSON.stringify(points))`.
 * Those objects include node labels, so CJK (and any non-Latin1) throws in workers.
 */
export function installMermaidUtf8Btoa(): void {
  if (installed) return;
  const nativeBtoa = globalThis.btoa.bind(globalThis);
  const patched = (data: string): string => {
    const str = `${data}`;
    try {
      return nativeBtoa(str);
    } catch (error) {
      if (!isNonLatin1BtoaError(error)) throw error;
      return nativeBtoa(utf8BinaryString(str));
    }
  };
  Object.defineProperty(globalThis, "btoa", {
    configurable: true,
    writable: true,
    value: patched,
  });
  installed = true;
}
