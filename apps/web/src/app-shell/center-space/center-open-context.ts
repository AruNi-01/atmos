import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";

/**
 * Resolve which center paint context should own a newly opened tab.
 *
 * Current-host requests (including extra space keys) stay on the active space.
 * Requests for a different workspace keep that workspace's host id so navigation
 * can switch there. Never treat an extra-space paint id as a workspace route id.
 */
export function resolveCenterOpenContextId(
  requested: string | null | undefined,
  hostId: string | null | undefined,
  paintId: string | null | undefined,
): string | null {
  const host = hostId?.trim() || null;
  const paint = paintId?.trim() || null;
  const current = paint || host;
  if (!requested?.trim()) return current;
  if (host && hostIdFromCenterKey(requested) === host) return current;
  return requested.trim();
}

/** Attach a tab to the focused pane of a center paint context. */
export function attachCenterTab(contextId: string, tabId: string): void {
  if (!contextId || !tabId) return;
  useCenterPaneLayoutStore.getState().openTab(contextId, tabId);
}
