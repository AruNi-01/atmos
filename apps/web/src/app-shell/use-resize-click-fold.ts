"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  isResizeClickGesture,
  type ResizeClickAxis,
} from "@/app-shell/resize-click-fold";

/**
 * Click the seam to fold; moving past slop leaves the gesture to resize.
 * `childRef` must point at a child of the handle; listeners bind to the parent
 * so this works with `PanelResizeHandle` (it overwrites `onPointerDown`).
 */
export function useResizeClickFold(
  childRef: RefObject<HTMLElement | null>,
  onFold?: () => void,
  axis: ResizeClickAxis = "vertical",
) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!onFold) return;
    const host = childRef.current?.parentElement;
    if (!host) return;

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      startRef.current = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || event.button !== 0) return;
      if (
        isResizeClickGesture(start, { x: event.clientX, y: event.clientY }, axis)
      ) {
        onFold();
      }
    };
    const onCancel = () => {
      startRef.current = null;
    };

    host.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [axis, childRef, onFold]);
}
