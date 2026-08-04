"use client";

import * as React from "react";

import { BrowserPanel } from "@/features/browser/components/BrowserPanel";
import type { BrowserCanvasViewportController } from "@/features/browser/components/BrowserSession";
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
  // APP-053: in-DOM <webview> — no native bounds sync. Keep a ref for API
  // compatibility with BrowserPanel (controller is a no-op stub now).
  const canvasViewportControllerRef =
    React.useRef<BrowserCanvasViewportController | null>(null);
  const source = shape.props.source as CanvasBrowserWidgetSource;

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
        // Keep inactive tabs mounted so canvas multi-tab does not remount/flash.
        keepInactiveTabsMounted
        syncUrlQueryParam={false}
        canvasViewportControllerRef={canvasViewportControllerRef}
      />
    </div>
  );
}
