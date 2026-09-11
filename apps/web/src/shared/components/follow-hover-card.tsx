"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { cn } from "@/shared/lib/utils";
import {
  clampFollowHoverHorizontal,
  computeFollowHoverOrigin,
  readFollowHoverPointerOffset,
  resolveFollowHoverPlacement,
  type FollowHoverPlacement,
  type FollowHoverSide,
} from "@/shared/lib/follow-hover-card";

export type FollowHoverCardProps = {
  children?: React.ReactNode;
  content: React.ReactNode;
  /**
   * Preferred vertical side. `"auto"` picks top when there is room, else bottom.
   * Horizontal placement is intentionally not used (mouse-follow only works vertically).
   */
  side?: FollowHoverSide;
  openDelay?: number;
  closeDelay?: number;
  className?: string;
  contentClassName?: string;
  /** Max 3D tilt while the pointer is on the trigger (degrees). */
  linkTiltMaxRotate?: number;
  cardWidth?: number;
  cardApproxHeight?: number;
  zIndex?: number;
  disabled?: boolean;
  /**
   * Controlled open. When set with `anchor`, the card is positioned against that
   * element (used by contenteditable chips that are not React children).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** External trigger element. Used by composer URL chips. */
  anchor?: HTMLElement | null;
  /** Stop click/pointer from bubbling off the trigger wrapper. Default true. */
  stopTriggerPropagation?: boolean;
};

/**
 * Mouse-follow + 3D tilt hover popover used by GitHub / X user cards and
 * link OG previews. Portal + dashed card + trigger→card hover bridge.
 */
export function FollowHoverCard({
  children,
  content,
  side = "auto",
  openDelay = 180,
  closeDelay = 140,
  className,
  contentClassName,
  linkTiltMaxRotate = 5,
  cardWidth = 320,
  cardApproxHeight = 220,
  zIndex = 80,
  disabled = false,
  open: openControlled,
  onOpenChange,
  anchor = null,
  stopTriggerPropagation = true,
}: FollowHoverCardProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverSurfaceRef = useRef<"none" | "link" | "card">("none");
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const isControlled = openControlled !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isHovered = isControlled ? Boolean(openControlled) : internalOpen;

  const [placement, setPlacement] = useState<FollowHoverPlacement>("top");
  const [origin, setOrigin] = useState({
    left: 0,
    top: 0,
    transformOrigin: "bottom center",
  });

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 20 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 20 });

  const rotateX = useTransform(mouseYSpring, (val) => {
    const pct = (val + 20) / 40;
    return linkTiltMaxRotate - pct * (2 * linkTiltMaxRotate);
  });
  const rotateY = useTransform(mouseXSpring, (val) => {
    const pct = (val + 20) / 40;
    return -linkTiltMaxRotate + pct * (2 * linkTiltMaxRotate);
  });

  const getTriggerEl = useCallback((): HTMLElement | null => {
    return anchor ?? triggerRef.current;
  }, [anchor]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChangeRef.current?.(next);
    },
    [isControlled],
  );

  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const updateAnchor = useCallback(() => {
    const el = getTriggerEl();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nextPlacement = resolveFollowHoverPlacement(side, rect, cardApproxHeight);
    const raw = computeFollowHoverOrigin(rect, nextPlacement);
    setPlacement(nextPlacement);
    setOrigin({
      left: clampFollowHoverHorizontal(raw.left, cardWidth),
      top: raw.top,
      transformOrigin: raw.transformOrigin,
    });
  }, [cardApproxHeight, cardWidth, getTriggerEl, side]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const resetMotion = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  const openCard = useCallback(
    (delay = openDelay) => {
      clearCloseTimer();
      clearOpenTimer();
      hoverSurfaceRef.current = "link";
      const show = () => {
        updateAnchor();
        setOpen(true);
      };
      if (delay <= 0) {
        show();
        return;
      }
      openTimerRef.current = setTimeout(show, delay);
    },
    [clearCloseTimer, clearOpenTimer, openDelay, setOpen, updateAnchor],
  );

  const scheduleClose = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      hoverSurfaceRef.current = "none";
      resetMotion();
    }, closeDelay);
  }, [clearCloseTimer, clearOpenTimer, closeDelay, resetMotion, setOpen]);

  useEffect(() => {
    if (!isHovered) return;
    const onScrollOrResize = () => updateAnchor();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [isHovered, updateAnchor]);

  useEffect(() => {
    if (isHovered) updateAnchor();
  }, [anchor, isHovered, updateAnchor]);

  const applyPointerOffset = useCallback(
    (clientX: number, clientY: number) => {
      if (hoverSurfaceRef.current !== "link") return;
      const el = getTriggerEl();
      const { nx, ny } = readFollowHoverPointerOffset(
        clientX,
        clientY,
        el?.getBoundingClientRect() ?? null,
      );
      x.set(nx);
      y.set(ny);
    },
    [getTriggerEl, x, y],
  );

  const handleLinkMouseMove = useCallback(
    (event: React.MouseEvent) => {
      applyPointerOffset(event.clientX, event.clientY);
    },
    [applyPointerOffset],
  );

  useEffect(() => {
    if (!anchor) return;
    const onEnter = () => {
      hoverSurfaceRef.current = "link";
      openCard(isControlled ? 0 : openDelay);
    };
    const onLeave = () => scheduleClose();
    const onMove = (event: MouseEvent) => {
      applyPointerOffset(event.clientX, event.clientY);
    };
    anchor.addEventListener("mouseenter", onEnter);
    anchor.addEventListener("mouseleave", onLeave);
    anchor.addEventListener("mousemove", onMove);
    return () => {
      anchor.removeEventListener("mouseenter", onEnter);
      anchor.removeEventListener("mouseleave", onLeave);
      anchor.removeEventListener("mousemove", onMove);
    };
  }, [anchor, applyPointerOffset, isControlled, openCard, openDelay, scheduleClose]);

  if (disabled) {
    return <>{children}</>;
  }

  const placementTranslate =
    placement === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)";

  const popover =
    isHovered && typeof document !== "undefined"
      ? createPortal(
          <div
            style={{
              position: "fixed",
              left: origin.left,
              top: origin.top,
              zIndex,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                transform: placementTranslate,
                perspective: 1000,
                pointerEvents: "none",
              }}
            >
              <motion.div
                onMouseEnter={() => {
                  clearCloseTimer();
                  hoverSurfaceRef.current = "card";
                  resetMotion();
                }}
                onMouseLeave={() => {
                  scheduleClose();
                }}
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {
                    opacity: 0,
                    y: placement === "bottom" ? -6 : 6,
                    scale: 0.98,
                    filter: "blur(2px)",
                    transition: { duration: 0.15, ease: "easeIn" },
                  },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    filter: "blur(0px)",
                    transition: {
                      duration: 0.22,
                      ease: [0.16, 1, 0.3, 1],
                    },
                  },
                }}
                style={{
                  x: mouseXSpring,
                  rotateX,
                  rotateY,
                  width: cardWidth,
                  transformStyle: "preserve-3d",
                  transformOrigin: origin.transformOrigin,
                  pointerEvents: "auto",
                }}
                data-slot="follow-hover-card"
                className={cn(
                  "relative select-none rounded-2xl border border-dashed border-border/70 bg-popover/95 p-4 shadow-xl backdrop-blur-md will-change-transform",
                  placement === "top" &&
                    "after:absolute after:left-0 after:top-full after:h-4 after:w-full",
                  placement === "bottom" &&
                    "after:absolute after:bottom-full after:left-0 after:h-4 after:w-full",
                  contentClassName,
                )}
              >
                {content}
              </motion.div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (children == null) {
    return <>{popover}</>;
  }

  return (
    <>
      <span
        ref={triggerRef}
        className={cn(
          "relative inline-flex max-w-full items-center gap-1.5 align-middle",
          className,
        )}
        onMouseEnter={() => {
          hoverSurfaceRef.current = "link";
          openCard();
        }}
        onMouseMove={handleLinkMouseMove}
        onMouseLeave={() => {
          scheduleClose();
        }}
        onClick={
          stopTriggerPropagation
            ? (event) => event.stopPropagation()
            : undefined
        }
        onPointerDown={
          stopTriggerPropagation
            ? (event) => event.stopPropagation()
            : undefined
        }
      >
        {children}
      </span>
      {popover}
    </>
  );
}
