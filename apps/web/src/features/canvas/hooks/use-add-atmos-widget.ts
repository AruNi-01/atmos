"use client";

import { useCallback } from "react";
import { createShapeId, type Editor, type TLShapeId } from "tldraw";

import {
  CANVAS_WIDGET_SHAPE_TYPE,
  createGlobalCanvasContextRef,
  createCanvasWidgetShapeProps,
  type CanvasContextRef,
  type CanvasWidgetSourceRef,
  type CanvasWidgetType,
} from "@/features/canvas/lib/canvas-widget-shape";
import { findCanvasWidgetPlacement } from "@/features/canvas/lib/canvas-widget-placement";
import { reparentCanvasShapeToFrame } from "@/features/canvas/lib/canvas-widget-frame";
import { CANVAS_WIDGET_REGISTRY, type AddableCanvasWidgetType } from "@/features/canvas/lib/canvas-widget-registry";
import { createCanvasCenterOverviewTab } from "@/features/canvas/lib/canvas-center-tabs";

function createBrowserId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `browser-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createSourceForWidgetType(
  widgetType: AddableCanvasWidgetType,
  context: CanvasContextRef,
): CanvasWidgetSourceRef {
  switch (widgetType) {
    case "workspace-context":
      return {
        type: "workspace-context",
        context,
        sections: ["notes", "tasks", "requirements"],
      };
    case "files":
      return {
        type: "files",
        context,
        rootPath: context.localPath,
        showHidden: false,
      };
    case "changes":
      return {
        type: "changes",
        context,
        group: "all",
      };
    case "review":
      return {
        type: "review",
        context,
      };
    case "pull-requests":
      return {
        type: "pull-requests",
        context,
        prSubTab: "open",
      };
    case "actions":
      return {
        type: "actions",
        context,
      };
    case "center": {
      const overviewTab = createCanvasCenterOverviewTab();
      return {
        type: "center",
        context,
        tabs: [overviewTab],
        activeTabId: overviewTab.id,
      };
    }
    case "browser":
      return {
        type: "browser",
        context,
        browserId: createBrowserId(),
      };
    case "agent-status":
      return {
        type: "agent-status",
        context,
      };
    case "ai-quota-usage":
      return {
        type: "ai-quota-usage",
        context,
      };
    case "agent-chat":
      return {
        type: "agent-chat",
        context,
        instanceId:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `agent-chat-${Date.now().toString(36)}`,
        chatId: null,
      };
  }
}

export function useAddAtmosWidget(editor: Editor | null) {
  return useCallback(
    (input: {
      widgetType: AddableCanvasWidgetType;
      context?: CanvasContextRef | null;
      frameId: TLShapeId | null;
      position?: { x: number; y: number };
      size?: { w: number; h: number };
      select?: boolean;
    }) => {
      if (!editor) {
        return null;
      }

      const widgetType = input.widgetType as CanvasWidgetType;
      const registryEntry = CANVAS_WIDGET_REGISTRY[widgetType];
      if (registryEntry.requiresContext && !input.context) {
        return null;
      }

      const source = createSourceForWidgetType(
        input.widgetType,
        input.context ?? createGlobalCanvasContextRef(),
      );
      const size = input.size ?? CANVAS_WIDGET_REGISTRY[widgetType].defaultSize;
      const shapeId = createShapeId();
      const { x, y } =
        input.position ??
        findCanvasWidgetPlacement(editor, size, {
          frameId: input.frameId,
        });

      editor.createShape({
        id: shapeId,
        type: CANVAS_WIDGET_SHAPE_TYPE,
        x,
        y,
        props: createCanvasWidgetShapeProps({
          widgetType,
          source,
          frameId: input.frameId,
          w: size.w,
          h: size.h,
        }),
      });
      reparentCanvasShapeToFrame(editor, shapeId, input.frameId);
      if (input.select !== false) {
        editor.select(shapeId);
      }
      return shapeId;
    },
    [editor],
  );
}
