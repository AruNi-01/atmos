/**
 * Per-pane tab-strip scrolling. Each strip must bind its own root so split
 * panes do not share a single ref (last pane would steal wheel/active scroll).
 */

export function applyHorizontalTabStripWheel(
  root: HTMLElement,
  event: {
    ctrlKey: boolean;
    deltaX: number;
    deltaY: number;
    preventDefault: () => void;
  },
  target: EventTarget | null,
): boolean {
  if (event.ctrlKey) return false;
  if (target == null || typeof root.contains !== "function" || !root.contains(target as Node)) {
    return false;
  }

  const primaryDelta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (primaryDelta === 0) return false;

  const maxScrollLeft = root.scrollWidth - root.clientWidth;
  if (maxScrollLeft <= 0) return false;

  const next = Math.max(0, Math.min(maxScrollLeft, root.scrollLeft + primaryDelta));
  if (next === root.scrollLeft) return false;
  event.preventDefault();
  root.scrollLeft = next;
  return true;
}

export function scrollActiveTabIntoStripView(root: HTMLElement): boolean {
  const activeTab = root.querySelector<HTMLElement>('[data-active], [aria-selected="true"]');
  if (!activeTab) return false;
  const lane = activeTab.closest<HTMLElement>("[data-center-tabs-scroll]") ?? root;
  const laneRect = lane.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();
  const isVisible = tabRect.left >= laneRect.left && tabRect.right <= laneRect.right;
  if (isVisible) return false;
  activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  return true;
}
