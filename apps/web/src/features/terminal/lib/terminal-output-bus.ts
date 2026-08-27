export type TerminalOutputListener = (sessionId: string, chunk: string) => void;

const listeners = new Set<TerminalOutputListener>();

export function subscribeTerminalOutput(listener: TerminalOutputListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishTerminalOutput(sessionId: string, data: string | Uint8Array): void {
  if (data.length === 0) return;
  const text = typeof data === "string" ? data : new TextDecoder().decode(data);
  for (const listener of listeners) {
    listener(sessionId, text);
  }
}
