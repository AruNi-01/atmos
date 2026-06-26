"use client";

import { UsagePopover } from "@/app-shell/UsagePopover";
import type {
  CanvasWidgetShape,
  CanvasWidgetSourceRef,
} from "@/features/canvas/lib/canvas-widget-shape";

type CanvasAIQuotaUsageWidgetSource = Extract<CanvasWidgetSourceRef, { type: "ai-quota-usage" }>;

export function CanvasAIQuotaUsageWidget({ shape }: { shape: CanvasWidgetShape }) {
  const source = shape.props.source as CanvasAIQuotaUsageWidgetSource;
  if (source.type !== "ai-quota-usage") {
    return null;
  }

  return (
    <div className="h-full min-h-0 overflow-hidden bg-background">
      <UsagePopover embedded />
    </div>
  );
}
