"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { centerStageParams } from "@/lib/nuqs/searchParams";
import { CanvasView } from "./CanvasView";

/**
 * Full-screen immersive Canvas overlay.
 *
 * Lives at the top of the app layout (next to <WorkspaceCreationOverlay/>) so it
 * covers the entire app — including sidebars and header — when the `canvas=true`
 * query param is active. Open with the Canvas item in Management Center;
 * collapse via the close button in CanvasView's top bar.
 */
export function CanvasOverlay() {
  const [canvas, setCanvas] = useQueryState("canvas", centerStageParams.canvas);
  const [animState, setAnimState] = React.useState<"idle" | "entering" | "visible" | "closing">("idle");
  const prevOpenRef = React.useRef(false);
  const previousFocusRef = React.useRef<Element | null>(null);

  React.useEffect(() => {
    if (canvas && !prevOpenRef.current) {
      previousFocusRef.current = document.activeElement;
      setAnimState("entering");
    }
    prevOpenRef.current = canvas;
  }, [canvas]);

  React.useEffect(() => {
    if (animState !== "entering") return;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimState("visible"));
    });
    return () => cancelAnimationFrame(raf);
  }, [animState]);

  const handleClose = React.useCallback(() => {
    setAnimState("closing");
    const savedEl = previousFocusRef.current;
    window.setTimeout(() => {
      setAnimState("idle");
      void setCanvas(false);
      if (savedEl instanceof HTMLElement && savedEl.isConnected) {
        savedEl.focus();
      }
      previousFocusRef.current = null;
    }, 300);
  }, [setCanvas]);

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
      <CanvasView onClose={handleClose} />
    </div>
  );
}
