"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";
import {
  RESIZE_FOLLOW_MARK_LENGTH_PX,
  RESIZE_FOLLOW_MARK_THICKNESS_PX,
  RESIZE_FOLLOW_SEAM_AT_ORIGIN,
  hideResizeFollowMark,
  paintResizeFollowMark,
  type ResizeFollowAxis,
  type ResizeFollowSeam,
  type ResizeFollowSide,
} from "@/app-shell/resize-follow-mark";
import { useResizeClickFold } from "@/app-shell/use-resize-click-fold";

/**
 * Short capsule on a resize seam. Follows the pointer along the handle and
 * sits on the side the pointer approached from. Render as a child of the
 * handle; listeners bind to the parent so the mark can stay `pointer-events-none`.
 */
export function ResizeFollowMark({
  axis,
  dragging,
  seam = RESIZE_FOLLOW_SEAM_AT_ORIGIN,
  onFold,
}: {
  axis: ResizeFollowAxis;
  dragging: boolean;
  /** Visual borders to hug, as px offsets from the handle origin toward end. */
  seam?: ResizeFollowSeam;
  /** Click (no cross-axis drag) folds. Hold-and-drag still resizes. */
  onFold?: () => void;
}) {
  const markRef = useRef<HTMLSpanElement>(null);
  const hoveredRef = useRef(false);
  const sideRef = useRef<ResizeFollowSide | null>(null);
  useResizeClickFold(markRef, onFold, axis);

  useEffect(() => {
    const mark = markRef.current;
    const host = mark?.parentElement;
    if (!mark || !host) return;

    const paint = (clientX: number, clientY: number, lockSide: boolean) => {
      sideRef.current = paintResizeFollowMark(
        mark,
        axis,
        { x: clientX, y: clientY },
        host.getBoundingClientRect(),
        lockSide ? sideRef.current : null,
        seam,
      );
    };

    const hideIfIdle = () => {
      if (dragging || hoveredRef.current) return;
      sideRef.current = null;
      hideResizeFollowMark(mark);
    };

    const onEnter = (event: PointerEvent) => {
      hoveredRef.current = true;
      paint(event.clientX, event.clientY, false);
    };
    const onMove = (event: PointerEvent) => {
      if (!hoveredRef.current && !dragging) return;
      paint(event.clientX, event.clientY, true);
    };
    const onLeave = () => {
      hoveredRef.current = false;
      hideIfIdle();
    };

    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    if (dragging) {
      window.addEventListener("pointermove", onMove);
    } else {
      hideIfIdle();
    }

    return () => {
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointermove", onMove);
    };
  }, [axis, dragging, seam.start, seam.end]);

  const vertical = axis === "vertical";
  return (
    <span
      ref={markRef}
      aria-hidden
      data-resize-follow-mark={axis}
      className={cn(
        "pointer-events-none absolute z-10 hidden origin-top-left rounded-full bg-foreground/50 data-[show]:block",
        vertical ? "top-0 left-1/2" : "top-1/2 left-0",
      )}
      style={
        vertical
          ? {
              width: RESIZE_FOLLOW_MARK_THICKNESS_PX,
              height: RESIZE_FOLLOW_MARK_LENGTH_PX,
            }
          : {
              width: RESIZE_FOLLOW_MARK_LENGTH_PX,
              height: RESIZE_FOLLOW_MARK_THICKNESS_PX,
            }
      }
    />
  );
}
