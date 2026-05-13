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
