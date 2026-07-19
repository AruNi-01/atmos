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
  const editor = useEditor();
  const source = shape.props.source as CanvasAgentChatWidgetSource;
  if (source.type !== "agent-chat") {
    return null;
  }

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

  const initialSessionBinding = React.useMemo(
    () => ({
      acpSessionId: source.acpSessionId ?? null,
      registryId: source.registryId ?? null,
      sessionCwd: source.sessionCwd ?? null,
    }),
    [source.acpSessionId, source.registryId, source.sessionCwd],
  );

  const onSessionBindingChange = React.useCallback(
    (binding: {
      acpSessionId: string | null;
      registryId: string | null;
      sessionCwd: string | null;
    }) => {
      const current = editor.getShape(shape.id as TLShapeId);
      if (!current || current.type !== "canvas-widget") return;
      const props = current.props as CanvasWidgetShape["props"];
      const src = props.source;
      if (!src || src.type !== "agent-chat") return;
      if (
        (src.acpSessionId ?? null) === binding.acpSessionId &&
        (src.registryId ?? null) === binding.registryId &&
        (src.sessionCwd ?? null) === binding.sessionCwd
      ) {
        return;
      }
      // Persist binding into the shape so it lands in the .atmos.tldr on save.
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
                acpSessionId: binding.acpSessionId,
                registryId: binding.registryId,
                sessionCwd: binding.sessionCwd,
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
        initialSessionBinding={initialSessionBinding}
        onSessionBindingChange={onSessionBindingChange}
      />
    </div>
  );
}
