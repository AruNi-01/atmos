import type * as React from "react";

/**
 * Portaled overlays sit outside Vaul / Radix dialog scroll locks.
 * Modal drawers set `pointer-events: none` on `body` and RemoveScroll
 * preventDefaults wheel/touchmove that originate outside the lock.
 */
export function isolateOverlayScroll<
  T extends { stopPropagation(): void },
>(event: T, next?: (event: T) => void) {
  event.stopPropagation();
  next?.(event);
}

export const overlayScrollClassName = "pointer-events-auto overscroll-contain";

export function overlayScrollHandlers<
  E extends HTMLElement,
>(handlers: {
  onWheel?: React.WheelEventHandler<E>;
  onTouchMove?: React.TouchEventHandler<E>;
}) {
  return {
    onWheel: (event: React.WheelEvent<E>) => {
      isolateOverlayScroll(event, handlers.onWheel);
    },
    onTouchMove: (event: React.TouchEvent<E>) => {
      isolateOverlayScroll(event, handlers.onTouchMove);
    },
  };
}
