"use client";

import { CanvasContextOverview } from "@/features/canvas/components/widgets/CanvasContextOverview";
import type { CanvasWidgetShape } from "@/features/canvas/lib/canvas-widget-shape";

export function CanvasWorkspaceContextWidget({ shape }: { shape: CanvasWidgetShape }) {
  const source = shape.props.source;
  if (source.type !== "workspace-context") {
    return null;
  }
  return <CanvasContextOverview context={source.context} />;
}
