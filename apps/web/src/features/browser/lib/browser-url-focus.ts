/**
 * Ephemeral “focus the URL bar” requests for a newly created browser surface.
 * Not persisted — restoring an existing empty tab must not steal focus.
 */
const pendingContextIds = new Set<string>();

export function requestBrowserContextUrlFocus(contextId: string): void {
  const id = contextId.trim();
  if (!id) return;
  pendingContextIds.add(id);
}

export function hasBrowserContextUrlFocus(contextId: string): boolean {
  return pendingContextIds.has(contextId.trim());
}

export function clearBrowserContextUrlFocus(contextId: string): void {
  pendingContextIds.delete(contextId.trim());
}

export function __resetBrowserContextUrlFocusForTests(): void {
  pendingContextIds.clear();
}
