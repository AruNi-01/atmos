export type TerminalWriteChunk = string | Uint8Array;

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function cloneTerminalWriteChunk(data: TerminalWriteChunk): TerminalWriteChunk {
  return typeof data === "string" ? data : data.slice();
}

export function coalesceTerminalWriteChunks(chunks: TerminalWriteChunk[]): TerminalWriteChunk[] {
  const coalesced: TerminalWriteChunk[] = [];
  let text = "";
  let byteLength = 0;
  let byteChunks: Uint8Array[] = [];

  const flushText = () => {
    if (!text) return;
    coalesced.push(text);
    text = "";
  };

  const flushBytes = () => {
    if (byteLength === 0) return;
    if (byteChunks.length === 1) {
      coalesced.push(byteChunks[0]);
    } else {
      const merged = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of byteChunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      coalesced.push(merged);
    }
    byteLength = 0;
    byteChunks = [];
  };

  for (const chunk of chunks) {
    if (typeof chunk === "string") {
      flushBytes();
      text += chunk;
    } else {
      flushText();
      byteLength += chunk.byteLength;
      byteChunks.push(chunk);
    }
  }

  flushText();
  flushBytes();

  return coalesced;
}

