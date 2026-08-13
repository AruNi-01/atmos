const pending = new Map<string, string>();

export function queuePaneInput(paneId: string, data: string): void {
  pending.set(paneId, data);
}

export function takeQueuedPaneInput(paneId: string): string | null {
  const value = pending.get(paneId);
  if (value === undefined) return null;
  pending.delete(paneId);
  return value;
}
