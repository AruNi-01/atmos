"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Plus } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/lib/utils";
import { SPRING_GLIDE, SPRING_PRESS } from "../lib/morphing-ease";
import {
  ADD_BUTTON_SIZE,
  LIQUID_JOIN,
  PANEL_RADIUS,
  RAIL_HEIGHT,
  SURFACE_INSET,
  TAB_HEIGHT,
  TAB_RADIUS,
  TAB_TOP,
  TAB_WIDTH,
  liquidPanelOnlyPath,
  liquidTabPath,
} from "../lib/morphing-tabs-geometry";

export type SpringTabProps = {
  id: string;
  targetLeft: number;
  dragging: boolean;
  dragLeft: MotionValue<number>;
  surfaceLeft: MotionValue<number>;
  /** Horizontal scroll of the tab strip — liquid is root-fixed so subtract this. */
  scrollLeft: MotionValue<number>;
  reduce: boolean;
  active: boolean;
  anyDragging: boolean;
  surfaceHost: HTMLDivElement | null;
  surfaceWidth: number;
  surfaceClassName?: string;
  zIndex: number;
  className: string;
  children: ReactNode;
  registerPosition: (id: string, position: MotionValue<number> | null) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
};


export function SpringTab({
  id,
  targetLeft,
  dragging,
  dragLeft,
  surfaceLeft,
  scrollLeft,
  reduce,
  active,
  anyDragging,
  surfaceHost,
  surfaceWidth,
  surfaceClassName,
  zIndex,
  className,
  children,
  registerPosition,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
}: SpringTabProps) {
  const target = useMotionValue(targetLeft);
  const position = useSpring(target, SPRING_GLIDE);
  const settledTransform = useTransform(
    reduce ? target : position,
    (left) => `translate3d(${left}px, 0, 0)`,
  );
  const draggedTransform = useTransform(
    dragLeft,
    (left) => `translate3d(${left}px, 0, 0)`,
  );

  useLayoutEffect(() => {
    target.set(targetLeft);
    if (reduce) position.jump(targetLeft);
  }, [position, reduce, target, targetLeft]);

  useLayoutEffect(() => {
    registerPosition(id, position);
    return () => registerPosition(id, null);
  }, [id, position, registerPosition]);

  const liquidDriver = anyDragging
    ? dragging
      ? dragLeft
      : position
    : surfaceLeft;

  return (
    <>
      {active && surfaceHost && surfaceWidth > SURFACE_INSET * 2
        ? createPortal(
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox={`0 0 ${surfaceWidth} ${RAIL_HEIGHT + PANEL_RADIUS}`}
              preserveAspectRatio="none"
              className={cn(
                // Always below the content panel (z-20). Raising to z-20 on drag
                // (beui default) paints the full-width panel strip over the toolbar.
                "pointer-events-none absolute inset-x-0 top-0 z-[15] w-full text-background",
                surfaceClassName,
              )}
              style={{ height: RAIL_HEIGHT + PANEL_RADIUS }}
            >
              <LiquidSurfacePath
                key={
                  anyDragging
                    ? dragging
                      ? "dragged"
                      : "displaced"
                    : "idle"
                }
                left={liquidDriver}
                scrollLeft={scrollLeft}
                surfaceWidth={surfaceWidth}
              />
            </svg>,
            surfaceHost,
          )
        : null}
      <motion.div
        style={{
          zIndex,
          transform: dragging ? draggedTransform : settledTransform,
        }}
        className={className}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
      >
        {children}
      </motion.div>
    </>
  );
}

export function LiquidSurfacePath({
  left,
  scrollLeft,
  surfaceWidth,
}: {
  /** Active tab left in track coordinates. */
  left: MotionValue<number>;
  /** Tab strip scroll — liquid SVG is root-fixed, so tab x = left − scroll. */
  scrollLeft: MotionValue<number>;
  surfaceWidth: number;
}) {
  const path = useTransform([left, scrollLeft], ([tabLeft, scroll]: number[]) =>
    liquidTabPath(tabLeft - scroll, surfaceWidth),
  );
  return <motion.path d={path} fill="currentColor" />;
}

export function AddTabButton({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      className="desktop-no-drag flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground"
    >
      <Plus className="size-3.5" />
    </button>
  );
}

