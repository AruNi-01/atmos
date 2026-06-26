"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Compass } from "lucide-react";
import { Button } from "@workspace/ui";

import { useCanvasRuntimeStore } from "@/features/canvas/store/canvas-runtime-store";

/**
 * Notice modal shown when a clickable element inside a Canvas widget triggers an
 * action that has no Canvas equivalent (M20). Rendered through a portal above
 * the `z-[150]` Canvas overlay so it is never hidden behind the board.
 */
export function CanvasUnsupportedInteractionDialog() {
  const notice = useCanvasRuntimeStore((state) => state.unsupportedInteractionNotice);
  const dismiss = useCanvasRuntimeStore((state) => state.dismissUnsupportedInteraction);

  React.useEffect(() => {
    if (!notice) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [dismiss, notice]);

  if (!notice || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Action not available on canvas"
      className="fixed inset-0 z-[300] flex items-center justify-center p-6"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={dismiss}
        aria-hidden="true"
      />
      <div className="relative z-[1] w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Compass className="size-4.5" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-base font-semibold text-foreground">Not available on the canvas</h2>
            <p className="text-sm text-muted-foreground">
              {notice.widgetLabel ? `The ${notice.widgetLabel} widget` : "This widget"} tried to open
              a view that the canvas doesn&apos;t host yet. Open it from the main app to continue.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button size="sm" onClick={dismiss}>
            Got it
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
