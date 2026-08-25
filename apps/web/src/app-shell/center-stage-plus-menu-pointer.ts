import * as React from "react";

/**
 * The plus-menu popover is portaled above center content, but xterm WebGL /
 * Electron `<webview>` can still win hit-testing. DOM `event.target` then
 * points at the overlay: CSS `:hover` never applies, Radix treats the click
 * as outside, and the menu closes without activating the item.
 *
 * Coordinate checks against the menu boxes are the source of truth — not
 * the event target. While open we also mute overlay hit targets so the
 * portaled menu can receive native pointer events.
 */

export const CENTER_STAGE_PLUS_MENU_CHROME_SELECTOR =
  "[data-center-stage-plus-menu], [data-center-stage-layouts-menu], [data-center-stage-plus-trigger]";

export const CENTER_STAGE_PLUS_MENU_BOX_SELECTOR =
  "[data-center-stage-plus-menu], [data-center-stage-layouts-menu]";

export const PLUS_MENU_HOT_ATTR = "data-plus-menu-hot";

export const PLUS_MENU_OVERLAY_MUTE_SELECTOR = [
  "canvas",
  "webview",
  "iframe",
  ".xterm",
  ".xterm-screen",
  ".xterm-helper-textarea",
  ".atmos-terminal",
  ".atmos-terminal-panel-active",
  ".terminal-pane",
  ".terminal-pane-toolbar",
  ".terminal-pane-body",
  "[data-center-panel-host]",
].join(",");

/** Covers the 4px popover `sideOffset` so hover-close does not fire in the gap. */
export const PLUS_MENU_HOVER_SLOP_PX = 6;

type Point = { x: number; y: number };

type RectBox = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

export function isPointInRect(
  x: number,
  y: number,
  rect: RectBox,
  slop = 0,
): boolean {
  return (
    x >= rect.left - slop &&
    x <= rect.right + slop &&
    y >= rect.top - slop &&
    y <= rect.bottom + slop
  );
}

export function elementFromEventTarget(target: EventTarget | null): Element | null {
  if (target && typeof (target as Element).closest === "function") {
    return target as Element;
  }
  const parent = (target as Text | null)?.parentElement ?? null;
  if (parent && typeof parent.closest === "function") return parent;
  return null;
}

export function isCenterStagePlusMenuEventTarget(target: EventTarget | null): boolean {
  const el = elementFromEventTarget(target);
  if (!el?.closest(CENTER_STAGE_PLUS_MENU_CHROME_SELECTOR)) return false;
  // Stacked inactive plus-menu panels must not count as a real hit.
  return !el.closest('[data-plus-menu-layer="inactive"]');
}

let plusMenuOpenCount = 0;

export function resetPlusMenuOpenCountForTests(): void {
  plusMenuOpenCount = 0;
  if (typeof document !== "undefined") {
    document.documentElement.removeAttribute("data-center-stage-plus-menu-open");
  }
}

export function markCenterStagePlusMenuOpen(open: boolean): void {
  if (open) plusMenuOpenCount += 1;
  else plusMenuOpenCount = Math.max(0, plusMenuOpenCount - 1);
  const root = document.documentElement;
  if (plusMenuOpenCount > 0) {
    root.setAttribute("data-center-stage-plus-menu-open", "");
    return;
  }
  root.removeAttribute("data-center-stage-plus-menu-open");
}

export function isPointerOverPlusMenuChrome(
  x: number,
  y: number,
  options: { slop?: number; root?: ParentNode } = {},
): boolean {
  const slop = options.slop ?? 0;
  const root = options.root ?? document;
  const nodes = root.querySelectorAll(CENTER_STAGE_PLUS_MENU_CHROME_SELECTOR);
  for (const node of nodes) {
    if (isPointInRect(x, y, node.getBoundingClientRect(), slop)) return true;
  }
  return false;
}

function isPlusMenuControlBlocked(el: Element): boolean {
  if (el.closest('[data-plus-menu-layer="inactive"]')) return true;
  if (el.closest("[inert]")) return true;
  if (el.closest("[aria-hidden='true']")) return true;
  if (typeof window === "undefined") return false;
  try {
    const style = window.getComputedStyle(el);
    return style.visibility === "hidden" || style.display === "none";
  } catch {
    return false;
  }
}

export function hitPlusMenuControl(
  x: number,
  y: number,
  root: ParentNode = document,
): HTMLElement | null {
  const menus = root.querySelectorAll(CENTER_STAGE_PLUS_MENU_BOX_SELECTOR);
  for (const menu of menus) {
    if (!isPointInRect(x, y, menu.getBoundingClientRect())) continue;
    const controls = menu.querySelectorAll("button, [role='tab']");
    for (const control of controls) {
      if (typeof (control as HTMLElement).click !== "function") continue;
      if (isPlusMenuControlBlocked(control)) continue;
      if (isPointInRect(x, y, control.getBoundingClientRect())) {
        return control as HTMLElement;
      }
    }
  }
  return null;
}

export function syncPlusMenuHover(
  x: number,
  y: number,
  root: ParentNode = document,
): HTMLElement | null {
  const hot = hitPlusMenuControl(x, y, root);
  const previous = root.querySelectorAll(`[${PLUS_MENU_HOT_ATTR}]`);
  for (const node of previous) {
    if (node !== hot) node.removeAttribute(PLUS_MENU_HOT_ATTR);
  }
  if (hot && !hot.hasAttribute(PLUS_MENU_HOT_ATTR)) {
    hot.setAttribute(PLUS_MENU_HOT_ATTR, "");
  }
  return hot;
}

export function clearPlusMenuHover(root: ParentNode = document): void {
  for (const node of root.querySelectorAll(`[${PLUS_MENU_HOT_ATTR}]`)) {
    node.removeAttribute(PLUS_MENU_HOT_ATTR);
  }
}

type SavedPointerEvents = {
  el: HTMLElement;
  value: string;
  priority: string;
};

export function muteCenterOverlayHits(
  root: ParentNode = document,
): () => void {
  const saved: SavedPointerEvents[] = [];
  const nodes = root.querySelectorAll(PLUS_MENU_OVERLAY_MUTE_SELECTOR);
  for (const node of nodes) {
    const el = node as HTMLElement;
    if (typeof el.style?.setProperty !== "function") continue;
    if (el.closest(CENTER_STAGE_PLUS_MENU_CHROME_SELECTOR)) continue;
    saved.push({
      el,
      value: el.style.getPropertyValue("pointer-events"),
      priority: el.style.getPropertyPriority("pointer-events"),
    });
    el.style.setProperty("pointer-events", "none", "important");
  }
  return () => {
    for (const entry of saved) {
      if (entry.value) {
        entry.el.style.setProperty("pointer-events", entry.value, entry.priority);
      } else {
        entry.el.style.removeProperty("pointer-events");
      }
    }
  };
}

type ClientPointLike = {
  clientX?: number;
  clientY?: number;
};

function clientPointFromUnknown(value: unknown): Point | null {
  if (!value || typeof value !== "object") return null;
  const x = "clientX" in value ? value.clientX : undefined;
  const y = "clientY" in value ? value.clientY : undefined;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return { x, y };
}

/**
 * Duck type for Radix dismissable-layer outside events. Must stay a
 * supertype of both `PointerDownOutsideEvent` and `FocusOutsideEvent`:
 * focus-outside wraps a `FocusEvent` with no client coordinates.
 */
export type PlusMenuOutsideDismissEvent = {
  target: EventTarget | null;
  preventDefault: () => void;
  clientX?: number;
  clientY?: number;
  detail?: { originalEvent?: Event | ClientPointLike };
};

export function clientPointFromOutsideEvent(
  event: Pick<PlusMenuOutsideDismissEvent, "clientX" | "clientY" | "detail">,
): Point | null {
  return (
    clientPointFromUnknown(event.detail?.originalEvent) ??
    clientPointFromUnknown(event)
  );
}

export function shouldRetainPlusMenuForOutsidePointer(
  event: Pick<PlusMenuOutsideDismissEvent, "target" | "clientX" | "clientY" | "detail">,
): boolean {
  if (isCenterStagePlusMenuEventTarget(event.target)) return true;
  const point = clientPointFromOutsideEvent(event);
  return (
    point != null &&
    isPointerOverPlusMenuChrome(point.x, point.y, { slop: PLUS_MENU_HOVER_SLOP_PX })
  );
}

export function shouldSchedulePlusMenuClose(event: {
  clientX: number;
  clientY: number;
  relatedTarget?: EventTarget | null;
}): boolean {
  if (isCenterStagePlusMenuEventTarget(event.relatedTarget ?? null)) return false;
  return !isPointerOverPlusMenuChrome(event.clientX, event.clientY, {
    slop: PLUS_MENU_HOVER_SLOP_PX,
  });
}

export type PlusMenuPointerLike = {
  button: number;
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  preventDefault: () => void;
  stopImmediatePropagation: () => void;
  stopPropagation?: () => void;
};

/**
 * When the pointer is geometrically over the plus menu but the event targeted
 * an overlay (canvas / webview / toolbar), stop that overlay from dismissing
 * the menu and activate the real control.
 */
export function stealPlusMenuClickFromOverlay(event: PlusMenuPointerLike): boolean {
  if (event.button !== 0) return false;
  if (isCenterStagePlusMenuEventTarget(event.target)) return false;
  if (
    !isPointerOverPlusMenuChrome(event.clientX, event.clientY, {
      slop: PLUS_MENU_HOVER_SLOP_PX,
    })
  ) {
    return false;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation?.();
  hitPlusMenuControl(event.clientX, event.clientY)?.click();
  return true;
}

export function useCenterStagePlusMenuOverlayGuard(
  open: boolean,
  options: {
    onPointerOverChrome?: () => void;
    onPointerLeaveChrome?: () => void;
  } = {},
): void {
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  React.useLayoutEffect(() => {
    if (!open) return;
    markCenterStagePlusMenuOpen(true);
    const unmute = muteCenterOverlayHits();
    return () => {
      unmute();
      markCenterStagePlusMenuOpen(false);
      clearPlusMenuHover();
    };
  }, [open]);

  React.useLayoutEffect(() => {
    if (!open) return;
    let overChrome = true;
    let stoleClick = false;

    const onPointerMove = (event: PointerEvent) => {
      const over = isPointerOverPlusMenuChrome(event.clientX, event.clientY, {
        slop: PLUS_MENU_HOVER_SLOP_PX,
      });
      syncPlusMenuHover(event.clientX, event.clientY);
      if (over) {
        overChrome = true;
        optionsRef.current.onPointerOverChrome?.();
        return;
      }
      if (!overChrome) return;
      overChrome = false;
      optionsRef.current.onPointerLeaveChrome?.();
    };

    const onPointerDown = (event: PointerEvent) => {
      stoleClick = stealPlusMenuClickFromOverlay(event);
    };

    const onMouseDown = (event: MouseEvent) => {
      if (stoleClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stoleClick = false;
        return;
      }
      stealPlusMenuClickFromOverlay(event);
    };

    // Window capture runs before document listeners (Radix dismiss, pane focus).
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("mousedown", onMouseDown, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [open]);
}
