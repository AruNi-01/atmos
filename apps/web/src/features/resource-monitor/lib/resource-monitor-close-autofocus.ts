export function isResourceMonitorDetailEventTarget(
  target: EventTarget | null,
): boolean {
  if (target == null || typeof target !== "object") return false;
  const closest = (target as { closest?: (selector: string) => unknown }).closest;
  if (typeof closest !== "function") return false;
  return closest.call(target, "[data-resource-monitor-detail]") != null;
}

export function isResourceMonitorDetailOpen(root: ParentNode | null = null): boolean {
  const scope = root ?? (typeof document === "undefined" ? null : document);
  return scope?.querySelector("[data-resource-monitor-detail]") != null;
}

export function preventResourceMonitorParentDismiss(event: {
  target?: EventTarget | null;
  preventDefault: () => void;
}): boolean {
  if (!isResourceMonitorDetailEventTarget(event.target ?? null)) return false;
  event.preventDefault();
  return true;
}

export function preventResourceMonitorParentEscape(
  event: { preventDefault: () => void },
  detailOpen: boolean,
): boolean {
  if (!detailOpen) return false;
  event.preventDefault();
  return true;
}

/**
 * Close-autofocus for Resource Monitor. Prevent Footer focus steal only while
 * a session navigation is in flight. Clear the flag after preventDefault.
 */
export function preventResourceMonitorCloseAutoFocus(
  navigating: { current: boolean },
  event: { preventDefault: () => void },
): boolean {
  if (!navigating.current) return false;
  event.preventDefault();
  navigating.current = false;
  return true;
}
