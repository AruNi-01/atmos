"use client";

import { useCallback } from "react";
import { createShapeId, useEditor, type TLShapeId } from "tldraw";

import {
  CANVAS_WIDGET_SHAPE_TYPE,
  CANVAS_WIDGET_DEFAULT_SIZES,
  createCanvasWidgetShapeProps,
  getCanvasContextId,
  getCanvasWidgetShapes,
  isCanvasCenterWidgetShape,
  updateCanvasCenterWidgetTabs,
  type CanvasContextRef,
} from "@/features/canvas/lib/canvas-widget-shape";
import {
  getCanvasShapeFrameKey,
  resolveCanvasInheritedFrameId,
  reparentCanvasShapeToFrame,
} from "@/features/canvas/lib/canvas-widget-frame";
import { findCanvasWidgetPlacement } from "@/features/canvas/lib/canvas-widget-placement";
import {
  ensureCanvasCenterOverviewTab,
  upsertCanvasCenterTab,
  type CanvasCenterTab,
} from "@/features/canvas/lib/canvas-center-tabs";

function contextMatches(a: CanvasContextRef, b: CanvasContextRef): boolean {
  return a.contextScope === b.contextScope && getCanvasContextId(a) === getCanvasContextId(b);
}

export function useOpenCanvasCenterTab(sourceShapeId: TLShapeId, context: CanvasContextRef) {
  const editor = useEditor();

  return useCallback(
    (tab: CanvasCenterTab) => {
      const inheritedFrameId = resolveCanvasInheritedFrameId(editor, sourceShapeId);
      const targetFrameKey = inheritedFrameId ?? "unframed";
      const existing = getCanvasWidgetShapes(editor).find((shape) => {
        if (!isCanvasCenterWidgetShape(shape)) {
          return false;
        }
        if (!contextMatches(shape.props.source.context, context)) {
          return false;
        }
        return getCanvasShapeFrameKey(editor, shape) === targetFrameKey;
      });

      if (existing && isCanvasCenterWidgetShape(existing)) {
        const next = upsertCanvasCenterTab(existing.props.source.tabs, tab);
        updateCanvasCenterWidgetTabs(editor, existing.id as TLShapeId, {
          ...existing.props.source,
          tabs: ensureCanvasCenterOverviewTab(next.tabs),
          activeTabId: next.activeTabId,
        });
        editor.select(existing.id as TLShapeId);
        return existing.id as TLShapeId;
      }

      const size = CANVAS_WIDGET_DEFAULT_SIZES.center;
      const shapeId = createShapeId();
      const { x, y } = findCanvasWidgetPlacement(editor, size, {
        frameId: inheritedFrameId,
        sourceShapeId,
      });
      const next = upsertCanvasCenterTab([], tab);

      editor.createShape({
        id: shapeId,
        type: CANVAS_WIDGET_SHAPE_TYPE,
        x,
        y,
        props: createCanvasWidgetShapeProps({
          widgetType: "center",
          source: {
            type: "center",
            context,
            tabs: ensureCanvasCenterOverviewTab(next.tabs),
            activeTabId: next.activeTabId,
          },
          frameId: inheritedFrameId,
        }),
      });
      reparentCanvasShapeToFrame(editor, shapeId, inheritedFrameId);
      editor.select(shapeId);
      return shapeId;
    },
    [context, editor, sourceShapeId],
  );
}
