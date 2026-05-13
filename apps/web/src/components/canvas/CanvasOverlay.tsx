"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { Button } from "@workspace/ui";
import { Minimize2 } from "lucide-react";
import { centerStageParams } from "@/lib/nuqs/searchParams";
import { CanvasView } from "./CanvasView";

/**
 * Full-screen immersive Canvas overlay.
 *
 * Lives at the top of the app layout (next to <WorkspaceCreationOverlay/>) so it
 * covers the entire app — including sidebars and header — when the `canvas=true`
 * query param is active. Open with the Canvas item in Management Center;
 * collapse via the close button injected into tldraw's SharePanel.
 */
export function CanvasOverlay() {
  const [canvas, setCanvas] = useQueryState("canvas", centerStageParams.canvas);
  const [animState, setAnimState] = React.useState<"idle" | "entering" | "visible" | "closing">("idle");
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

  // Collapse button is rendered inside tldraw's SharePanel slot via `trailingActions`
  // so it lines up with the canvas-level Import / Refresh / Save-status controls.
  const collapseButton = (
    <Button
      variant="outline"
      size="icon"
      onClick={handleClose}
      className="size-9 rounded-xl bg-background/95 shadow-sm"
      title="Collapse canvas"
      aria-label="Collapse canvas"
    >
      <Minimize2 className="size-4" />
    </Button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Canvas"
      className={`fixed inset-0 z-[150] bg-background transition-transform duration-300 ease-in-out ${
        isOpen ? "translate-y-0" : isClosing ? "translate-y-full" : "translate-y-full"
      }`}
    >
      <CanvasView trailingActions={collapseButton} />
    </div>
  );
}
