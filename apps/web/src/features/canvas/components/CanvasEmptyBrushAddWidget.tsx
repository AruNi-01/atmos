"use client";

import React from "react";
import { useEditor } from "tldraw";

import {
  normalizeCanvasPageRect,
  shouldOpenEmptyBrushAddWidget,
  type CanvasPageRect,
} from "@/features/canvas/lib/canvas-empty-brush";
import { CanvasEmptyBrushAddWidgetPopover } from "@/features/canvas/components/CanvasEmptyBrushAddWidgetPopover";

/** Keep the anchor mounted long enough for Radix popover exit animation. */
const EMPTY_BRUSH_POPOVER_EXIT_MS = 160;

/**
 * Detects empty select-tool marquee gestures and offers a compact Add Widget UI
 * sized to the brushed region.
 */
export function CanvasEmptyBrushAddWidget() {
  const editor = useEditor();
  const [region, setRegion] = React.useState<CanvasPageRect | null>(null);
  const [open, setOpen] = React.useState(false);
  const regionRef = React.useRef<CanvasPageRect | null>(null);
  const openRef = React.useRef(false);
  const wasBrushingRef = React.useRef(false);
  const lastBrushRef = React.useRef<CanvasPageRect | null>(null);
  const cancelledRef = React.useRef(false);
  const openFrameRef = React.useRef<number | null>(null);
  const exitTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  regionRef.current = region;
  openRef.current = open;

  const clearExitTimeout = React.useCallback(() => {
    if (exitTimeoutRef.current != null) {
      clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }
  }, []);

  const dismiss = React.useCallback(() => {
    setOpen(false);
    clearExitTimeout();
    exitTimeoutRef.current = setTimeout(() => {
      exitTimeoutRef.current = null;
      setRegion(null);
    }, EMPTY_BRUSH_POPOVER_EXIT_MS);
  }, [clearExitTimeout]);

  const present = React.useCallback(
    (nextRegion: CanvasPageRect) => {
      clearExitTimeout();
      setRegion(nextRegion);
      setOpen(true);
    },
    [clearExitTimeout],
  );

  React.useEffect(() => {
    return () => {
      clearExitTimeout();
      if (openFrameRef.current != null) {
        cancelAnimationFrame(openFrameRef.current);
      }
    };
  }, [clearExitTimeout]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (editor.isIn("select.brushing") || editor.isIn("select.scribble_brushing")) {
        cancelledRef.current = true;
      }
      if (openRef.current) {
        dismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [dismiss, editor]);

  React.useEffect(() => {
    const cleanup = editor.store.listen(
      () => {
        const isBrushing = editor.isIn("select.brushing");
        const brush = normalizeCanvasPageRect(editor.getInstanceState().brush);

        if (isBrushing) {
          wasBrushingRef.current = true;
          if (brush) {
            lastBrushRef.current = brush;
          }
          // A new brush cancels any open empty-region popover.
          if (openRef.current) {
            dismiss();
          }
          return;
        }

        if (!wasBrushingRef.current) {
          // Close if the user selects existing shapes while the popover is open.
          if (openRef.current && editor.getSelectedShapeIds().length > 0) {
            dismiss();
          }
          return;
        }

        wasBrushingRef.current = false;
        const finishedBrush = lastBrushRef.current ?? brush;
        lastBrushRef.current = null;
        const cancelled = cancelledRef.current;
        cancelledRef.current = false;

        if (openFrameRef.current != null) {
          cancelAnimationFrame(openFrameRef.current);
        }

        // Wait one frame so selection/brush session state settles after brush exit.
        openFrameRef.current = requestAnimationFrame(() => {
          openFrameRef.current = null;
          const shouldOpen = shouldOpenEmptyBrushAddWidget({
            wasBrushing: true,
            cancelled,
            selectedShapeIds: editor.getSelectedShapeIds(),
            brush: finishedBrush,
          });
          if (shouldOpen && finishedBrush) {
            present(finishedBrush);
          }
        });
      },
      { scope: "session" },
    );

    return cleanup;
  }, [dismiss, editor, present]);

  if (!region) {
    return null;
  }

  return (
    <CanvasEmptyBrushAddWidgetPopover
      editor={editor}
      region={region}
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          dismiss();
        }
      }}
    />
  );
}
