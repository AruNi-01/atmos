"use client";

import { AgentChatPanel } from "@/features/agent/components/AgentChatPanel";
import type {
  CanvasWidgetShape,
  CanvasWidgetSourceRef,
} from "@/features/canvas/lib/canvas-widget-shape";

type CanvasAgentChatWidgetSource = Extract<CanvasWidgetSourceRef, { type: "agent-chat" }>;

export function CanvasAgentChatWidget({ shape }: { shape: CanvasWidgetShape }) {
  const source = shape.props.source as CanvasAgentChatWidgetSource;
  if (source.type !== "agent-chat") {
    return null;
  }
  const context = source.context;
  const contextId = context.contextScope === "project" ? context.projectId : context.workspaceId;

  return (
    <div className="h-full min-h-0 overflow-hidden bg-background">
      <AgentChatPanel
        variant="sidebar"
        publishStatus={false}
        active
        contextOverride={{
          workspaceId: context.contextScope === "workspace" ? contextId : null,
          projectId: context.contextScope === "project" ? contextId : null,
          effectiveContextId: contextId,
          currentView: context.contextScope,
        }}
      />
    </div>
  );
}
