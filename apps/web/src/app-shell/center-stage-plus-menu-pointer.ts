import * as React from "react";

/**
 * The plus-menu popover is portaled above center content, but xterm WebGL /
 * Electron `<webview>` can still win hit-testing. DOM `event.target` then
 * points at the overlay, Radix treats the click as outside, and the menu
 * closes without activating the item the user actually clicked.
 *
 * Coordinate checks against the menu boxes are the source of truth — not
 * the event target.
 */

export const CENTER_STAGE_PLUS_MENU_CHROME_SELECTOR =
  "[data-center-stage-plus-menu], [data-center-stage-layouts-menu], [data-center-stage-plus-trigger]";

export const CENTER_STAGE_PLUS_MENU_BOX_SELECTOR =
  "[data-center-stage-plus-menu], [data-center-stage-layouts-menu]";

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
  return Boolean(el?.closest(CENTER_STAGE_PLUS_MENU_CHROME_SELECTOR));
}

export function markCenterStagePlusMenuOpen(open: boolean): void {
  const root = document.documentElement;
  if (open) {
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
  return Boolean(el.closest("[inert], [aria-hidden='true']"));
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

export function clientPointFromOutsideEvent(event: {
  clientX?: number;
  clientY?: number;
  detail?: { originalEvent?: { clientX?: number; clientY?: number } };
}): Point | null {
  const original = event.detail?.originalEvent;
  const x = original?.clientX ?? event.clientX;
  const y = original?.clientY ?? event.clientY;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return { x, y };
}

export function shouldRetainPlusMenuForOutsidePointer(event: {
  target: EventTarget | null;
  clientX?: number;
  clientY?: number;
  detail?: { originalEvent?: { clientX?: number; clientY?: number } };
}): boolean {
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

/**
 * When the pointer is geometrically over the plus menu but the event targeted
 * an overlay (canvas / webview / toolbar), stop that overlay from dismissing
 * the menu and activate the real control.
 */
export function stealPlusMenuClickFromOverlay(event: PointerEvent): boolean {
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
  hitPlusMenuControl(event.clientX, event.clientY)?.click();
  return true;
}

export function useCenterStagePlusMenuOverlayGuard(open: boolean): void {
  React.useLayoutEffect(() => {
    markCenterStagePlusMenuOpen(open);
    return () => markCenterStagePlusMenuOpen(false);
  }, [open]);

  React.useLayoutEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      stealPlusMenuClickFromOverlay(event);
    };
    // Window capture runs before document listeners (Radix dismiss, pane focus).
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);
}
