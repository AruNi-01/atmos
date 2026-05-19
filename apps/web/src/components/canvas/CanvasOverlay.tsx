"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { ChevronDown } from "lucide-react";
import { centerStageParams } from "@/lib/nuqs/searchParams";
import { useDesktopTrafficLightsPadding } from "@/hooks/use-desktop-traffic-lights-padding";
import { CanvasView } from "./CanvasView";

/**
 * Full-screen immersive Canvas overlay.
 *
 * Lives at the top of the app layout (next to <WorkspaceCreationOverlay/>) so it
 * covers the entire app — including sidebars and header — when the `canvas=true`
 * query param is active. Open with the Canvas item in Management Center;
 * collapse via the chevron-down "pull tab" rendered at the top-center (mirrors
 * the New Workspace welcome overlay's collapse affordance).
 */
export function CanvasOverlay() {
  const [canvas, setCanvas] = useQueryState("canvas", centerStageParams.canvas);
  const [animState, setAnimState] = React.useState<"idle" | "entering" | "visible" | "closing">("idle");
  // macOS desktop (non-fullscreen) reserves ~32px at the top for the window
  // traffic-lights; nudge the collapse pull-tab below them so it stays clickable.
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();
  /** Previous committed value of `canvas` from nuqs (starts false so `?canvas=true` on first paint opens correctly). */
  const prevCanvasOpenRef = React.useRef(false);
  const previousFocusRef = React.useRef<Element | null>(null);

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

  if (!canvas && animState === "idle") {
    return null;
  }

  const isOpen = animState === "visible";
  const isClosing = animState === "closing";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Canvas"
      className={`fixed inset-0 z-[150] bg-background transition-transform duration-300 ease-in-out ${
        isOpen ? "translate-y-0" : isClosing ? "translate-y-full" : "translate-y-full"
      }`}
    >
      <CanvasView />
      {/*
        Top-center "pull-down" collapse affordance — mirrors the New Workspace
        welcome overlay's bouncing chevron so users get a consistent gesture
        for dismissing full-screen overlays. Sits above tldraw's UI (z-[160]).
      */}
      <button
        type="button"
        onClick={handleClose}
        className="group absolute left-1/2 top-0 z-[160] flex -translate-x-1/2 cursor-pointer flex-col items-center gap-0 px-6 pb-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
        style={needsTrafficLightsPadding ? { top: 32 } : undefined}
        aria-label="Collapse canvas"
        title="Collapse canvas"
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
