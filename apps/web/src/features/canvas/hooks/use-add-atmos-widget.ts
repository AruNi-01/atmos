"use client";

import { useCallback } from "react";
import { createShapeId, type Editor, type TLShapeId } from "tldraw";

import {
  CANVAS_WIDGET_SHAPE_TYPE,
  createCanvasWidgetShapeProps,
  type CanvasContextRef,
  type CanvasWidgetSourceRef,
  type CanvasWidgetType,
} from "@/features/canvas/lib/canvas-widget-shape";
import { findCanvasWidgetPlacement } from "@/features/canvas/lib/canvas-widget-placement";
import { reparentCanvasShapeToFrame } from "@/features/canvas/lib/canvas-widget-frame";
import { CANVAS_WIDGET_REGISTRY, type AddableCanvasWidgetType } from "@/features/canvas/lib/canvas-widget-registry";
import { createCanvasCenterOverviewTab } from "@/features/canvas/lib/canvas-center-tabs";

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
    case "center": {
      const overviewTab = createCanvasCenterOverviewTab();
      return {
        type: "center",
        context,
        tabs: [overviewTab],
        activeTabId: overviewTab.id,
      };
    }
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
      };
  }
}

export function useAddAtmosWidget(editor: Editor | null) {
  return useCallback(
    (input: {
      widgetType: AddableCanvasWidgetType;
      context: CanvasContextRef;
      frameId: TLShapeId | null;
    }) => {
      if (!editor) {
        return null;
      }

      const widgetType = input.widgetType as CanvasWidgetType;
      const source = createSourceForWidgetType(input.widgetType, input.context);
      const size = CANVAS_WIDGET_REGISTRY[widgetType].defaultSize;
      const shapeId = createShapeId();
      const { x, y } = findCanvasWidgetPlacement(editor, size, {
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
        }),
      });
      reparentCanvasShapeToFrame(editor, shapeId, input.frameId);
      editor.select(shapeId);
      return shapeId;
    },
    [editor],
  );
}
