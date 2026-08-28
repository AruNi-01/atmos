"use client";

import * as React from "react";
import { useEditor, type TLShapeId } from "tldraw";

import { AgentChatPanel } from "@/features/agent/components/AgentChatPanel";
import type {
  CanvasWidgetShape,
  CanvasWidgetSourceRef,
} from "@/features/canvas/lib/canvas-widget-shape";
import { isGlobalCanvasContext } from "@/features/canvas/lib/canvas-widget-shape";

type CanvasAgentChatWidgetSource = Extract<CanvasWidgetSourceRef, { type: "agent-chat" }>;

export function CanvasAgentChatWidget({ shape }: { shape: CanvasWidgetShape }) {
  const source = shape.props.source;
  if (source.type !== "agent-chat") {
    return null;
  }

  return <CanvasAgentChatWidgetContent shape={shape} source={source} />;
}

function CanvasAgentChatWidgetContent({
  shape,
  source,
}: {
  shape: CanvasWidgetShape;
  source: CanvasAgentChatWidgetSource;
}) {
  const editor = useEditor();
  const context = source.context;
  const contextId = context.contextScope === "project" ? context.projectId : context.workspaceId;
  const contextOverride = isGlobalCanvasContext(context)
    ? {
        workspaceId: null,
        projectId: null,
        effectiveContextId: null,
        currentView: "agents" as const,
      }
    : {
        workspaceId: context.contextScope === "workspace" ? contextId : null,
        projectId: context.contextScope === "project" ? contextId : null,
        effectiveContextId: contextId,
        currentView: context.contextScope,
      };

  // Isolate this card from sidebar chat and other agent-chat widgets.
  const instanceKey = source.instanceId?.trim() || String(shape.id);

  const persistConversationId = React.useCallback(
    (conversationId: string) => {
      const current = editor.getShape(shape.id as TLShapeId);
      if (!current || current.type !== "canvas-widget") return;
      const props = current.props as CanvasWidgetShape["props"];
      const src = props.source;
      if (!src || src.type !== "agent-chat") return;
      if ((src.conversationId ?? null) === conversationId) return;
      editor.run(
        () => {
          editor.updateShape({
            id: current.id,
            type: current.type,
            props: {
              ...props,
              source: {
                ...src,
                instanceId: src.instanceId ?? instanceKey,
                conversationId,
              },
            },
          });
        },
        { history: "ignore" },
      );
    },
    [editor, instanceKey, shape.id],
  );

  return (
    <div className="h-full min-h-0 overflow-hidden bg-background">
      <AgentChatPanel
        variant="sidebar"
        publishStatus={false}
        active
        allowFullscreen={false}
        contextOverride={contextOverride}
        instanceKey={instanceKey}
        conversationId={source.conversationId ?? null}
        onOpenConversation={persistConversationId}
      />
    </div>
  );
}
