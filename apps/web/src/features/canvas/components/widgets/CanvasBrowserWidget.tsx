"use client";

import * as React from "react";
import { useEditor, useValue, type TLShapeId } from "tldraw";

import { BrowserPanel } from "@/features/run-preview/components/BrowserPanel";
import type { PreviewCanvasViewportController } from "@/features/run-preview/components/Preview";
import type {
  CanvasWidgetShape,
  CanvasWidgetSourceRef,
} from "@/features/canvas/lib/canvas-widget-shape";
import { isGlobalCanvasContext } from "@/features/canvas/lib/canvas-widget-shape";

type CanvasBrowserWidgetSource = Extract<CanvasWidgetSourceRef, { type: "browser" }>;

export function CanvasBrowserWidget({
  shape,
}: {
  shape: CanvasWidgetShape;
}) {
  const editor = useEditor();
  const canvasViewportControllerRef =
    React.useRef<PreviewCanvasViewportController | null>(null);
  const source = shape.props.source as CanvasBrowserWidgetSource;

  const viewportSignal = useValue(
    `canvas-browser.viewport.${shape.id}`,
    () => {
      const camera = editor.getCamera();
      let bounds: ReturnType<typeof editor.getShapePageBounds> | null = null;
      try {
        bounds = editor.getShapePageBounds(shape.id as TLShapeId) ?? null;
      } catch {
        bounds = null;
      }
      if (!bounds) {
        return `missing|${camera.x}|${camera.y}|${camera.z}`;
      }

      try {
        const topLeft = editor.pageToViewport({ x: bounds.minX, y: bounds.minY });
        const bottomRight = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY });
        return [
          Math.round(topLeft.x),
          Math.round(topLeft.y),
          Math.round(bottomRight.x),
          Math.round(bottomRight.y),
        ].join("|");
      } catch {
        return `error|${camera.x}|${camera.y}|${camera.z}`;
      }
    },
    [editor, shape.id],
  );

  React.useLayoutEffect(() => {
    canvasViewportControllerRef.current?.syncViewport();
    const frameId = window.requestAnimationFrame(() => {
      canvasViewportControllerRef.current?.syncViewport();
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [viewportSignal]);

  React.useEffect(() => {
    const controllerRef = canvasViewportControllerRef;
    return () => {
      controllerRef.current?.hide();
    };
  }, []);

  if (source.type !== "browser") {
    return null;
  }

  const context = source.context;
  const workspaceId = isGlobalCanvasContext(context)
    ? null
    : context.contextScope === "workspace"
      ? context.workspaceId
      : null;
  const projectId = isGlobalCanvasContext(context)
    ? undefined
    : context.contextScope === "project"
      ? context.projectId ?? undefined
      : context.projectId ?? undefined;

  return (
    <div className="h-full min-h-0 overflow-hidden bg-background">
      <BrowserPanel
        workspaceId={workspaceId}
        projectId={projectId}
        isActive
        browserContextId={`canvas-browser:${source.browserId || shape.id}`}
        allowStandaloneWindow={false}
        allowMaximize={false}
        keepInactiveTabsMounted={false}
        syncUrlQueryParam={false}
        canvasViewportControllerRef={canvasViewportControllerRef}
      />
    </div>
  );
}
