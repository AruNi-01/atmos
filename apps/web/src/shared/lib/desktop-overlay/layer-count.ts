/**
 * Pure layer open detection for APP-052 elevation refcount (B5).
 * Lifecycle open ≠ fully painted: do not require opacity > 0 (fade-in).
 *
 * These helpers run against the OVERLAY document (a different window realm),
 * so they must never use host-realm `instanceof HTMLElement` or the host
 * `window.getComputedStyle` — cross-realm instanceof is always false.
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
 * Hover-only layers never need pointer capture: the overlay window stays
 * click-through so host clicks keep working while a tooltip is visible.
 */
const PASS_THROUGH_LAYER_SELECTOR = [
  "[data-slot='tooltip-content']",
  "[data-slot='hover-card-content']",
  "[role='tooltip']",
].join(",");

export type OpenLayerSummary = {
  /** Open floating layers (drives ensure/show/release). */
  open: number;
  /** Open layers that need pointer capture (anything but tooltip/hover-card). */
  capture: number;
};

function isElement(node: Node): node is HTMLElement {
  // Cross-realm safe (overlay document nodes are not host-realm HTMLElement).
  return node.nodeType === 1;
}

function computedStyleOf(
  el: HTMLElement,
  getComputedStyleFn?: (el: Element) => CSSStyleDeclaration,
): CSSStyleDeclaration | null {
  if (getComputedStyleFn) return getComputedStyleFn(el);
  const view = el.ownerDocument?.defaultView;
  return view ? view.getComputedStyle(el) : null;
}

/**
 * Whether a floater should count as open for ensure/show/release.
 * - Requires not closed / not aria-hidden / not display:none / not visibility:hidden
 * - Does NOT require opacity > 0 (avoids missing fade-in frames)
 * - Opt-in surface markers still require opacity > 0 so permanent peek shells
 *   with opacity-0 do not pin elevation forever
 */
export function isLifecycleOpenLayer(
  el: HTMLElement,
  getComputedStyleFn?: (el: Element) => CSSStyleDeclaration,
): boolean {
  if (el.getAttribute("data-state") === "closed") return false;
  if (el.getAttribute("aria-hidden") === "true") return false;

  const style = computedStyleOf(el, getComputedStyleFn);
  if (
    style &&
    (style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse")
  ) {
    return false;
  }

  // Permanent host markers (sidebar peek) stay mounted with opacity 0.
  if (el.hasAttribute("data-atmos-native-surface-overlay")) {
    if (style && Number(style.opacity) <= 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
  }

  return true;
}

export function summarizeOpenLayers(
  roots: Array<ParentNode | null | undefined>,
  getComputedStyleFn?: (el: Element) => CSSStyleDeclaration,
): OpenLayerSummary {
  let open = 0;
  let capture = 0;
  for (const root of roots) {
    if (!root) continue;
    root.querySelectorAll(LAYER_SELECTOR).forEach((node) => {
      if (!isElement(node)) return;
      if (!isLifecycleOpenLayer(node, getComputedStyleFn)) return;
      open += 1;
      if (!node.matches(PASS_THROUGH_LAYER_SELECTOR)) capture += 1;
    });
  }
  return { open, capture };
}

export function countOpenLayers(
  roots: Array<ParentNode | null | undefined>,
  getComputedStyleFn?: (el: Element) => CSSStyleDeclaration,
): number {
  return summarizeOpenLayers(roots, getComputedStyleFn).open;
}
