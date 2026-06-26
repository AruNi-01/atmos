"use client";

import React from "react";

import { fsApi, type FileTreeNode } from "@/api/ws-api";
import { createCanvasCenterTab } from "@/features/canvas/lib/canvas-center-tabs";
import {
  CANVAS_WIDGET_SHAPE_TYPE,
  getCanvasContextId,
  getCanvasContextLabel,
  type CanvasWidgetShape,
  type CanvasWidgetSourceRef,
} from "@/features/canvas/lib/canvas-widget-shape";
import { useOpenCanvasCenterTab } from "@/features/canvas/hooks/use-open-canvas-center-tab";
import { FileTreePanel } from "@/features/files/components/FileTreePanel";
import { useEditor, type TLShapeId } from "tldraw";

type CanvasFilesWidgetSource = Extract<CanvasWidgetSourceRef, { type: "files" }>;

export function CanvasFilesWidget({ shape }: { shape: CanvasWidgetShape }) {
  const source = shape.props.source;
  if (source.type !== "files") {
    return null;
  }
  return <CanvasFilesWidgetBody shapeId={shape.id as TLShapeId} source={source} />;
}

function CanvasFilesWidgetBody({
  shapeId,
  source,
}: {
  shapeId: TLShapeId;
  source: CanvasFilesWidgetSource;
}) {
  const editor = useEditor();
  const [nodes, setNodes] = React.useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const openCenterTab = useOpenCanvasCenterTab(shapeId, source.context);
  const contextId = getCanvasContextId(source.context);

  const loadFiles = React.useCallback(async () => {
    if (!source.rootPath) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await fsApi.listProjectFiles(source.rootPath, {
        showHidden: source.showHidden ?? false,
      });
      setNodes(response.tree);
    } catch (err) {
      console.error("Failed to load canvas files widget:", err);
      setNodes([]);
    } finally {
      setIsLoading(false);
    }
  }, [source.rootPath, source.showHidden]);

  React.useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  return (
    <FileTreePanel
      projectName={getCanvasContextLabel(source.context)}
      data={nodes}
      rootPath={source.rootPath}
      isLoading={isLoading}
      showHidden={source.showHidden ?? false}
      contextId={contextId}
      currentProjectPath={source.rootPath}
      revealEnabled={false}
      onRefresh={loadFiles}
      onShowHiddenChange={(showHidden) => {
        editor.updateShape({
          id: shapeId,
          type: CANVAS_WIDGET_SHAPE_TYPE,
          props: {
            source: {
              ...source,
              showHidden,
            },
          },
        });
      }}
      onOpenFile={(path, options) => {
        openCenterTab(
          createCanvasCenterTab({
            kind: "file",
            path,
            mode: options.preview ? "preview" : "edit",
          }),
        );
      }}
    />
  );
}
