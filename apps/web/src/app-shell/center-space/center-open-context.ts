import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";
import {
  layoutOwnsTab,
  planCenterTabAttach,
  type CenterTabAttachPlacement,
} from "@/app-shell/center-pane/center-pane-layout";
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

/** Attach a tab to a center paint context. See {@link planCenterTabAttach}. */
export function attachCenterTab(
  contextId: string,
  tabId: string,
  opts?: { placement?: CenterTabAttachPlacement },
): void {
  if (!contextId || !tabId) return;
  const store = useCenterPaneLayoutStore.getState();
  const plan = planCenterTabAttach(store.getLayout(contextId), tabId, opts);
  if (plan.action === "reveal") {
    store.focus(contextId, plan.paneId);
    store.setActiveTab(contextId, plan.paneId, tabId);
    return;
  }
  store.openTab(contextId, tabId);
}

/** Drop a tab from one pane. Returns whether any pane still lists it. */
export function dismissCenterTabInPane(
  contextId: string,
  paneId: string | undefined,
  tabId: string,
  preferredNextActiveId?: string | null,
): { stillOwned: boolean } {
  if (!contextId || !tabId) return { stillOwned: false };
  const store = useCenterPaneLayoutStore.getState();
  if (!paneId) {
    store.removeTab(contextId, tabId, preferredNextActiveId);
    return { stillOwned: false };
  }
  store.removeTabFromPane(contextId, paneId, tabId, preferredNextActiveId);
  const layout = store.getLayout(contextId);
  return { stillOwned: Boolean(layout && layoutOwnsTab(layout, tabId)) };
}
