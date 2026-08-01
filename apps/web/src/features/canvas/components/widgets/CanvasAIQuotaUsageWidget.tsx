"use client";

import { QuotaPopover } from "@/app-shell/QuotaPopover";
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
      <QuotaPopover embedded />
    </div>
  );
}
