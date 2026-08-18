"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/** Keep in sync with `.push-page-slide-*` animation duration in globals.css */
export const PUSH_PAGE_DURATION_MS = 450;
export const PUSH_PAGE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Horizontal: overlay from the right, base shifts left. Vertical: overlay from the bottom, base shifts up. */
export type PushPageAxis = "horizontal" | "vertical";

export type PushPagePhase = "closed" | "open" | "closing";

export type PushPageCloseOptions = {
  /** Runs after the slide-out finishes (and phase is `closed`). */
  onComplete?: () => void;
};

export type UsePushPageTransitionOptions = {
  /** Override slide duration (ms). Defaults to {@link PUSH_PAGE_DURATION_MS}. */
  durationMs?: number;
};

export type UsePushPageTransitionResult = {
  phase: PushPagePhase;
  /** Overlay should be treated as presented (`open` or `closing`). */
  isPresented: boolean;
  /** Overlay is fully on-screen (not animating out). */
  isActive: boolean;
  open: () => void;
  /** Start slide-out; optional `onComplete` runs after unmount-ready state. */
  close: (options?: PushPageCloseOptions) => void;
};

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Phase machine for hierarchical push navigation
 * (list → detail, shell → settings, app → canvas).
 *
 * Call `open()` to present, `close({ onComplete })` to slide out then run navigation
 * or cleanup. Never navigate in the same frame as `close()` — that aborts the exit.
 */
export function usePushPageTransition(
  options?: UsePushPageTransitionOptions,
): UsePushPageTransitionResult {
  const durationMs = options?.durationMs ?? PUSH_PAGE_DURATION_MS;
  const [phase, setPhase] = React.useState<PushPagePhase>("closed");
  const phaseRef = React.useRef<PushPagePhase>(phase);
  phaseRef.current = phase;
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const open = React.useCallback(() => {
    onCompleteRef.current = null;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setPhase("open");
  }, []);

  const close = React.useCallback(
    (closeOptions?: PushPageCloseOptions) => {
      if (phaseRef.current !== "open") return;
      onCompleteRef.current = closeOptions?.onComplete ?? null;
      setPhase("closing");
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      const delayMs = prefersReducedMotion() ? 0 : durationMs;
      const timer = setTimeout(() => {
        if (phaseRef.current !== "closing") return;
        if (closeTimerRef.current !== timer) return;
        closeTimerRef.current = null;
        const complete = onCompleteRef.current;
        onCompleteRef.current = null;
        setPhase("closed");
        complete?.();
      }, delayMs);
      closeTimerRef.current = timer;
    },
    [durationMs],
  );

  return {
    phase,
    isPresented: phase !== "closed",
    isActive: phase === "open",
    open,
    close,
  };
}

export type PushPageStackProps = {
  phase: PushPagePhase;
  /** Always-mounted underlay (list / app shell). Scroll state is preserved. */
  base: React.ReactNode;
  /** Pushed page; mount while presented (or always when `keepOverlayMounted`). */
  overlay?: React.ReactNode | null;
  /** Stable key for remounting enter animation when the pushed page identity changes. */
  overlayKey?: string | number;
  /** Optional full-screen layer (e.g. spinner) above base while overlay is not ready. */
  loading?: React.ReactNode | null;
  className?: string;
  baseClassName?: string;
  overlayClassName?: string;
  /**
   * Slide axis. `horizontal` (default): overlay from the right, base shifts left.
   * `vertical`: overlay from the bottom, base shifts up.
   */
  axis?: PushPageAxis;
  /** When active, shift/dim the base under the overlay. Default true. */
  shiftBase?: boolean;
  /**
   * Keep overlay mounted while `phase === "closed"` (off-screen). Used for warm
   * keep-alive (e.g. Canvas) so re-open does not cold-load.
   */
  keepOverlayMounted?: boolean;
  /** Duration for base shift transition (ms). Default {@link PUSH_PAGE_DURATION_MS}. */
  durationMs?: number;
};

function overlaySlideClass(axis: PushPageAxis, phase: PushPagePhase): string | undefined {
  if (phase === "open") {
    return axis === "vertical" ? "push-page-slide-in-y" : "push-page-slide-in-x";
  }
  if (phase === "closing") {
    return axis === "vertical" ? "push-page-slide-out-y" : "push-page-slide-out-x";
  }
  return undefined;
}

function baseShiftTransform(axis: PushPageAxis, active: boolean): string {
  if (!active) return "translate3d(0, 0, 0)";
  return axis === "vertical"
    ? "translate3d(0, -18%, 0)"
    : "translate3d(-18%, 0, 0)";
}

function overlayRestTransform(axis: PushPageAxis, offscreen: boolean): string {
  if (!offscreen) return "translate3d(0, 0, 0)";
  return axis === "vertical"
    ? "translate3d(0, 100%, 0)"
    : "translate3d(100%, 0, 0)";
}

/**
 * Hierarchical page stack: base stays mounted; overlay slides in along `axis`
 * and slides out on close. Pair with {@link usePushPageTransition}.
 */
export function PushPageStack({
  phase,
  base,
  overlay = null,
  overlayKey,
  loading = null,
  className,
  baseClassName,
  overlayClassName,
  axis = "horizontal",
  shiftBase = true,
  keepOverlayMounted = false,
  durationMs = PUSH_PAGE_DURATION_MS,
}: PushPageStackProps) {
  const presented = phase !== "closed";
  const showOverlay =
    overlay != null && (presented || keepOverlayMounted);
  const baseActive = phase === "open";
  const blockBase = (presented && showOverlay) || loading != null;
  const reduce = prefersReducedMotion();
  const warmHidden = keepOverlayMounted && phase === "closed" && overlay != null;

  const baseMotionStyle: React.CSSProperties | undefined =
    !shiftBase || reduce || !presented
      ? undefined
      : {
          transitionProperty: "transform, opacity",
          transitionDuration: `${durationMs}ms`,
          transitionTimingFunction: PUSH_PAGE_EASE,
          transform: baseShiftTransform(axis, baseActive),
          opacity: baseActive ? 0.55 : 1,
        };

  const slideClass = warmHidden ? undefined : overlaySlideClass(axis, phase);

  return (
    <div className={cn("relative h-full overflow-hidden bg-background", className)}>
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden bg-background",
          presented && shiftBase && !reduce && "will-change-transform",
          blockBase && "pointer-events-none",
          baseClassName,
        )}
        aria-hidden={blockBase}
        style={baseMotionStyle}
      >
        {base}
      </div>

      {loading}

      {showOverlay ? (
        <div
          key={overlayKey}
          className={cn(
            "absolute inset-0 z-20 overflow-hidden bg-background shadow-2xl will-change-transform",
            slideClass,
            warmHidden && "pointer-events-none",
            overlayClassName,
          )}
          aria-hidden={warmHidden || undefined}
          // Warm-hidden: park off-screen without enter/exit animation classes.
          style={
            warmHidden
              ? { transform: overlayRestTransform(axis, true) }
              : undefined
          }
        >
          {overlay}
        </div>
      ) : null}
    </div>
  );
}
