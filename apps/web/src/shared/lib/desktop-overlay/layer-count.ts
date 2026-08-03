/**
 * Pure layer open detection for APP-052 elevation refcount (B5).
 * Lifecycle open ≠ fully painted: do not require opacity > 0 (fade-in).
 */

export const LAYER_SELECTOR = [
  "[data-slot='dialog-content']",
  "[data-slot='dialog-overlay']",
  "[data-slot='sheet-content']",
  "[data-slot='sheet-overlay']",
  "[data-slot='drawer-content']",
  "[data-slot='drawer-popup']",
  "[data-slot='popover-content']",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='context-menu-content']",
  "[data-slot='select-content']",
  "[data-slot='tooltip-content']",
  "[data-slot='hover-card-content']",
  "[data-atmos-native-surface-overlay]",
  "[role='dialog']",
  "[role='tooltip']",
].join(",");

/**
 * Whether a floater should count as open for ensure/show/release.
 * - Requires not closed / not aria-hidden / not display:none / not visibility:hidden
 * - Does NOT require opacity > 0 (avoids missing fade-in frames)
 * - Opt-in surface markers still require opacity > 0 so permanent peek shells
 *   with opacity-0 do not pin elevation forever
 */
export function isLifecycleOpenLayer(
  el: HTMLElement,
  getComputedStyleFn: (el: Element) => CSSStyleDeclaration = (e) =>
    window.getComputedStyle(e),
): boolean {
  if (el.getAttribute("data-state") === "closed") return false;
  if (el.getAttribute("aria-hidden") === "true") return false;

  const style = getComputedStyleFn(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse"
  ) {
    return false;
  }

  // Permanent host markers (sidebar peek) stay mounted with opacity 0.
  if (el.hasAttribute("data-atmos-native-surface-overlay")) {
    if (Number(style.opacity) <= 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
  }

  return true;
}

export function countOpenLayers(
  roots: Array<ParentNode | null | undefined>,
  getComputedStyleFn?: (el: Element) => CSSStyleDeclaration,
): number {
  let n = 0;
  for (const root of roots) {
    if (!root) continue;
    root.querySelectorAll(LAYER_SELECTOR).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (!isLifecycleOpenLayer(node, getComputedStyleFn)) return;
      n += 1;
    });
  }
  return n;
}
