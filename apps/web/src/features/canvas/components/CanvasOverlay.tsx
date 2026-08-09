"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import { ChevronDown } from "lucide-react";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";
import { useDesktopTrafficLightsPadding } from "@/shared/hooks/use-desktop-traffic-lights-padding";
import { cn } from "@/shared/lib/utils";

const CanvasView = dynamic(() => import("./CanvasView").then((mod) => mod.CanvasView), {
  ssr: false,
  loading: () => <CanvasOverlayLoading />,
});

/** How long a closed Canvas stays warm in memory before full unmount. */
export const CANVAS_KEEP_ALIVE_TTL_MS = 60 * 60 * 1000; // 1 hour

function CanvasOverlayLoading() {
  const t = useTranslations("app.loading");

  return (
    <div className="flex h-full min-h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-foreground" />
        <p className="text-sm text-muted-foreground">{t("label")}</p>
      </div>
    </div>
  );
}

/**
 * Full-screen immersive Canvas overlay.
 *
 * Lives at the top of the app layout (next to <WorkspaceCreationOverlay/>) so it
 * covers the entire app — including sidebars and header — when the `canvas=true`
 * query param is active. Open with the Canvas item in Launchpad;
 * collapse via the chevron-down "pull tab" rendered at the top-center (mirrors
 * the New Workspace welcome overlay's collapse affordance).
 *
 * Keep-alive: after open, CanvasView stays mounted while closed (visibility only)
 * for {@link CANVAS_KEEP_ALIVE_TTL_MS}, then fully unmounts to free memory.
 * Re-open within the TTL is instant; after TTL the next open cold-loads again.
 */
export function CanvasOverlay() {
  const t = useTranslations("Canvas.chrome");
  const [canvas, setCanvas] = useQueryState("canvas", centerStageParams.canvas);
  const [animState, setAnimState] = React.useState<"idle" | "entering" | "visible" | "closing">("idle");
  /** True while CanvasView should stay mounted (open, animating, or warm-hidden). */
  const [hasMountedCanvas, setHasMountedCanvas] = React.useState(false);
  // macOS desktop (non-fullscreen) reserves ~32px at the top for the window
  // traffic-lights; nudge the collapse pull-tab below them so it stays clickable.
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();
  /** Previous committed value of `canvas` from nuqs (starts false so `?canvas=true` on first paint opens correctly). */
  const prevCanvasOpenRef = React.useRef(false);
  const previousFocusRef = React.useRef<Element | null>(null);

  // First open (or closing mid-flight) claims keep-alive until TTL expires.
  if ((canvas || animState !== "idle") && !hasMountedCanvas) {
    setHasMountedCanvas(true);
  }

  React.useEffect(() => {
    const wasOpen = prevCanvasOpenRef.current;
    prevCanvasOpenRef.current = canvas;

    if (canvas && !wasOpen) {
      previousFocusRef.current = document.activeElement;
      setAnimState("entering");
      return;
    }

    // Query cleared externally (URL edit, router replace, etc.) while overlay was active —
    // drive the same closing animation so `animState` cannot stay visible/entering with canvas=false.
    if (!canvas && wasOpen) {
      setAnimState((prev) => {
        if (prev === "idle" || prev === "closing") return prev;
        return "closing";
      });
    }
  }, [canvas]);

  React.useEffect(() => {
    if (animState !== "entering") return;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimState("visible"));
    });
    return () => cancelAnimationFrame(raf);
  }, [animState]);

  React.useEffect(() => {
    if (animState !== "closing") return;
    const savedEl = previousFocusRef.current;
    const id = window.setTimeout(() => {
      setAnimState("idle");
      void setCanvas(false);
      if (savedEl instanceof HTMLElement && savedEl.isConnected) {
        savedEl.focus();
      }
      previousFocusRef.current = null;
    }, 300);
    return () => clearTimeout(id);
  }, [animState, setCanvas]);

  const handleClose = React.useCallback(() => {
    setAnimState("closing");
  }, []);

  const isOpen = Boolean(canvas) && animState !== "closing";
  const isClosing = animState === "closing";
  /** Fully dismissed but keep-alive: hide without unmounting CanvasView. */
  const isKeepAliveHidden = hasMountedCanvas && !canvas && animState === "idle";
  const isOverlayActive = isOpen || isClosing;

  // Warm-hidden only: after TTL, drop the mount so tldraw/terminals free memory.
  // Re-open before TTL cancels this timer (effect re-runs when isKeepAliveHidden flips).
  React.useEffect(() => {
    if (!isKeepAliveHidden) return;
    const id = window.setTimeout(() => {
      setHasMountedCanvas(false);
      setAnimState("idle");
    }, CANVAS_KEEP_ALIVE_TTL_MS);
    return () => clearTimeout(id);
  }, [isKeepAliveHidden]);

  React.useEffect(() => {
    if (!isOverlayActive) {
      return;
    }
    document.body.classList.add("canvas-overlay-active");
    return () => {
      document.body.classList.remove("canvas-overlay-active");
    };
  }, [isOverlayActive]);

  // Never opened this session, or keep-alive TTL expired — no tldraw cost.
  if (!hasMountedCanvas) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal={isOverlayActive ? true : undefined}
      aria-hidden={isKeepAliveHidden ? true : undefined}
      aria-label={t("common.canvas")}
      data-canvas-overlay="true"
      data-canvas-open={isOpen ? "true" : "false"}
      data-canvas-keep-alive={isKeepAliveHidden ? "true" : "false"}
      inert={isKeepAliveHidden ? true : undefined}
      className={cn(
        "fixed inset-0 z-[150] bg-background transition-transform duration-300 ease-in-out",
        isOpen ? "translate-y-0" : "translate-y-full",
        isKeepAliveHidden && "pointer-events-none",
      )}
    >
      {/*
        Always keep CanvasView once mounted — do not gate on animState.
        Closing only slides the shell; the board stays warm in memory.
      */}
      <CanvasView />
      {/*
        Top-center "pull-down" collapse affordance — mirrors the New Workspace
        welcome overlay's bouncing chevron so users get a consistent gesture
        for dismissing full-screen overlays. Sits above tldraw's UI (z-[160]).
      */}
      <button
        type="button"
        onClick={handleClose}
        tabIndex={isKeepAliveHidden ? -1 : undefined}
        className="group absolute left-1/2 top-0 z-[160] flex -translate-x-1/2 cursor-pointer flex-col items-center gap-0 px-6 pb-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
        style={needsTrafficLightsPadding ? { top: 32 } : undefined}
        aria-label={t("overlay.collapseCanvas")}
        title={t("overlay.collapseCanvas")}
      >
        {/*
          Hugs the top edge with a hair of breathing room (`-mt-0.5` lets the
          chevron sit just below the screen edge instead of flush against it).
          The bounce-down animation only plays on hover.
        */}
        <ChevronDown
          className="-mt-0.5 h-5 w-9 group-hover:animate-[bounce-down_1.6s_ease-in-out_infinite]"
          strokeWidth={1.2}
        />
        <ChevronDown
          className="-mt-2.5 h-5 w-9 group-hover:animate-[bounce-down_1.6s_ease-in-out_0.15s_infinite]"
          strokeWidth={1.2}
        />
      </button>
    </div>
  );
}
