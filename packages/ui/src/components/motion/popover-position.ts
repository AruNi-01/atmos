"use client";

import { type MutableRefObject, useCallback, useLayoutEffect, useState } from "react";

export type PortalLayout = {
  trigger: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  content: {
    width: number;
    height: number;
  };
};

export type PopoverSide = "top" | "bottom" | "left" | "right";
export type PopoverAlign = "start" | "end";

const VIEWPORT_PAD = 8;

export function popoverPortalCoords(
  side: PopoverSide,
  align: PopoverAlign,
  layout: PortalLayout,
  sideOffset: number,
  viewport?: { width: number; height: number },
): { left: number; top: number; side: PopoverSide } {
  const resolved =
    side === "left" || side === "right"
      ? resolveHorizontalSide(side, layout, sideOffset, viewport)
      : side;
  return {
    side: resolved,
    left: panelLeft(resolved, align, layout, sideOffset),
    top: panelTop(resolved, align, layout, sideOffset),
  };
}

function resolveHorizontalSide(
  preferred: "left" | "right",
  layout: PortalLayout,
  sideOffset: number,
  viewport?: { width: number; height: number },
): "left" | "right" {
  if (!viewport) return preferred;
  const rightLeft = layout.trigger.left + layout.trigger.width + sideOffset;
  const leftLeft = layout.trigger.left - layout.content.width - sideOffset;
  const fitsRight = rightLeft + layout.content.width <= viewport.width - VIEWPORT_PAD;
  const fitsLeft = leftLeft >= VIEWPORT_PAD;
  if (preferred === "left" && !fitsLeft && fitsRight) return "right";
  if (preferred === "right" && !fitsRight && fitsLeft) return "left";
  return preferred;
}

function panelLeft(
  side: PopoverSide,
  align: PopoverAlign,
  layout: PortalLayout,
  sideOffset: number,
): number {
  if (side === "right") return layout.trigger.left + layout.trigger.width + sideOffset;
  if (side === "left") return layout.trigger.left - layout.content.width - sideOffset;
  return align === "end"
    ? layout.trigger.left + layout.trigger.width - layout.content.width
    : layout.trigger.left;
}

function panelTop(
  side: PopoverSide,
  align: PopoverAlign,
  layout: PortalLayout,
  sideOffset: number,
): number {
  if (side === "bottom") return layout.trigger.top + layout.trigger.height + sideOffset;
  if (side === "top") return layout.trigger.top - layout.content.height - sideOffset;
  return align === "end"
    ? layout.trigger.top + layout.trigger.height - layout.content.height
    : layout.trigger.top;
}

/**
 * Scale that keeps the trigger corner still when a popover's layout box
 * changes size. The box has already moved to its new anchor; multiplying the
 * previous visual size into that box is the start of the zoom.
 * Returns null when the change is too small to animate.
 */
export function anchoredSizeScale(
  previous: { width: number; height: number },
  next: { width: number; height: number },
  currentScale: { x: number; y: number } = { x: 1, y: 1 },
): { x: number; y: number } | null {
  if (previous.width < 1 || previous.height < 1 || next.width < 1 || next.height < 1) {
    return null;
  }
  if (Math.abs(previous.width - next.width) < 1 && Math.abs(previous.height - next.height) < 1) {
    return null;
  }
  const x = (previous.width * currentScale.x) / next.width;
  const y = (previous.height * currentScale.y) / next.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x - 1) < 0.01 && Math.abs(y - 1) < 0.01) return null;
  return { x, y };
}

function sameLayout(a: PortalLayout | null, b: PortalLayout) {
  return (
    a?.trigger.left === b.trigger.left &&
    a.trigger.top === b.trigger.top &&
    a.trigger.width === b.trigger.width &&
    a.trigger.height === b.trigger.height &&
    a.content.width === b.content.width &&
    a.content.height === b.content.height
  );
}

/** Measures a trigger and portalled panel in viewport coordinates. */
export function usePopoverPortalPosition<
  TriggerElement extends HTMLElement,
  ContentElement extends HTMLElement,
>(
  triggerRef: MutableRefObject<TriggerElement | null>,
  contentRef: MutableRefObject<ContentElement | null>,
  active: boolean,
) {
  const [layout, setLayout] = useState<PortalLayout | null>(null);

  const update = useCallback(() => {
    const trigger = triggerRef.current;
    const content = contentRef.current;
    if (!trigger || !content) return;

    const rect = trigger.getBoundingClientRect();
    const next: PortalLayout = {
      trigger: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      content: {
        width: content.offsetWidth,
        height: content.offsetHeight,
      },
    };
    setLayout((current) => (sameLayout(current, next) ? current : next));
  }, [contentRef, triggerRef]);

  useLayoutEffect(() => {
    update();
    if (!active) return;

    const trigger = triggerRef.current;
    const content = contentRef.current;
    const observer = new ResizeObserver(update);
    if (trigger) observer.observe(trigger);
    if (content) observer.observe(content);

    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [active, contentRef, triggerRef, update]);

  return layout;
}
