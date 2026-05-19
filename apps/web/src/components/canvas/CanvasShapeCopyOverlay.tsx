"use client";

import * as React from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { useEditor, useValue, type TLShapeId } from "tldraw";
import {
  cn,
  toastManager,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";

import { copyToClipboard } from "@/utils/copy";
import {
  CANVAS_TERMINAL_SHAPE_TYPE,
  type CanvasTerminalShape,
} from "./canvas-terminal-shape";
import { formatCanvasShapesForCopy } from "./canvas-shape-text";
import { formatCanvasTerminalForCopy } from "./canvas-terminal-copy";
import { useCanvasTerminalRefs } from "./canvas-terminal-ref-context";

/** Gap above the selection outline (viewport px). */
const COPY_BUTTON_OUTSET = 8;

/**
 * tldraw stacks UI at 300+ inside `.tl-container`; Radix tooltip defaults to z-50 on
 * `document.body`, which sits under the canvas chrome. Keep copy tooltips above panels.
 * @see node_modules/tldraw/src/lib/ui.css (--tl-layer-panels: 300)
 * @see node_modules/@tldraw/editor/editor.css (--tl-layer-canvas-in-front: 250)
 */
const COPY_TOOLTIP_Z_CLASS = "!z-[1100]";

/**
 * Per-selected-shape copy control at the shape's top-right (tldraw agent-style context export).
 */
export function CanvasShapeCopyOverlay() {
  const editor = useEditor();
  const selectedIds = useValue(
    "canvas-shape-copy.selection",
    () => editor.getSelectedShapeIds(),
    [editor],
  );

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="pointer-events-none absolute inset-0 z-[var(--tl-layer-focused-input,10)]"
        aria-hidden
      >
        {selectedIds.map((shapeId) => (
          <ShapeCopyButton key={shapeId} shapeId={shapeId} editor={editor} />
        ))}
      </div>
    </TooltipProvider>
  );
}

function ShapeCopyButton({
  shapeId,
  editor,
}: {
  shapeId: TLShapeId;
  editor: ReturnType<typeof useEditor>;
}) {
  const terminalRefs = useCanvasTerminalRefs();

  const topRight = useValue(
    `canvas-shape-copy.anchor.${shapeId}`,
    () => {
      let bounds: ReturnType<typeof editor.getShapePageBounds> | null = null;
      try {
        bounds = editor.getShapePageBounds(shapeId) ?? null;
      } catch {
        return null;
      }
      if (!bounds) return null;
      try {
        return editor.pageToViewport({ x: bounds.maxX, y: bounds.minY });
      } catch {
        return null;
      }
    },
    [editor, shapeId],
  );

  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle");

  if (!topRight) return null;

  const handleCopy = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    editor.markEventAsHandled(event.nativeEvent);

    const shape = editor.getShape(shapeId);
    if (!shape) return;

    setState("loading");
    try {
      const payload =
        shape.type === CANVAS_TERMINAL_SHAPE_TYPE
          ? await formatCanvasTerminalForCopy(
              shape as CanvasTerminalShape,
              terminalRefs?.current.get(shapeId) ?? null,
            )
          : await formatCanvasShapesForCopy(editor, [shapeId], {
              terminalRefs: terminalRefs?.current,
            });

      if (!payload.trim()) {
        toastManager.add({
          title: "Canvas",
          description: "Nothing to copy from this shape",
          type: "warning",
        });
        setState("idle");
        return;
      }

      const ok = await copyToClipboard(payload);
      toastManager.add({
        title: "Canvas",
        description: ok ? "Copied to clipboard" : "Copy failed",
        type: ok ? "success" : "error",
      });
      setState(ok ? "done" : "idle");
      if (ok) {
        window.setTimeout(() => setState("idle"), 2000);
      }
    } catch (err) {
      toastManager.add({
        title: "Canvas",
        description: err instanceof Error ? err.message : "Copy failed",
        type: "error",
      });
      setState("idle");
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Copy shape content for the agent"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => void handleCopy(event)}
          style={{
            left: topRight.x,
            top: topRight.y - COPY_BUTTON_OUTSET,
            transform: "translate(-100%, -100%)",
          }}
          className={cn(
            "pointer-events-auto absolute inline-flex size-7 items-center justify-center rounded-md border border-border",
            "bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm",
            "transition-colors hover:bg-accent hover:text-foreground",
          )}
        >
          {state === "loading" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : state === "done" ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className={COPY_TOOLTIP_Z_CLASS}
      >
        Copy shape content for the agent
      </TooltipContent>
    </Tooltip>
  );
}
