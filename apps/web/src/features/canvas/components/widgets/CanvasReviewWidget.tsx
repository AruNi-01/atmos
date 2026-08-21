"use client";

import React from "react";
import { useTranslations } from "next-intl";

import type { ReviewTarget } from "@/api/ws-api";
import { ReviewContextProvider } from "@/features/diff/components/review/ReviewContextProvider";
import { ReviewActions } from "@/features/diff/components/review/ReviewActions";
import ReviewView, { type ReviewViewOpenFileArgs } from "@/features/diff/components/ReviewView";
import {
  EDITOR_REVIEW_GROUP_PREFIX,
} from "@/features/editor/store/use-editor-store";
import { createCanvasCenterTab } from "@/features/canvas/lib/canvas-center-tabs";
import {
  getCanvasContextId,
  type CanvasContextRef,
  type CanvasWidgetShape,
  type CanvasWidgetSourceRef,
} from "@/features/canvas/lib/canvas-widget-shape";
import { useOpenCanvasCenterTab } from "@/features/canvas/hooks/use-open-canvas-center-tab";
import { type TLShapeId } from "tldraw";

type CanvasReviewWidgetSource = Extract<CanvasWidgetSourceRef, { type: "review" }>;

function reviewTargetFromContext(context: CanvasContextRef): ReviewTarget | null {
  if (context.contextScope === "project" && context.projectId) {
    return { kind: "project", projectId: context.projectId };
  }
  if (context.contextScope === "workspace" && context.workspaceId) {
    return { kind: "workspace", workspaceId: context.workspaceId };
  }
  return null;
}

export function CanvasReviewWidget({ shape }: { shape: CanvasWidgetShape }) {
  if (shape.props.source.type !== "review") {
    return null;
  }
  const target = reviewTargetFromContext(shape.props.source.context);
  return (
    <ReviewContextProvider
      target={target}
      filePath=""
      revisionGuid={shape.props.source.revisionGuid}
      selectionMode="local"
      initialSessionGuid={shape.props.source.sessionGuid ?? null}
      initialRevisionGuid={shape.props.source.revisionGuid ?? null}
    >
      <CanvasReviewWidgetBody shapeId={shape.id as TLShapeId} source={shape.props.source} />
    </ReviewContextProvider>
  );
}

function CanvasReviewWidgetBody({
  shapeId,
  source,
}: {
  shapeId: TLShapeId;
  source: CanvasReviewWidgetSource;
}) {
  const t = useTranslations("Canvas.chrome");
  const contextId = getCanvasContextId(source.context);
  const openCenterTab = useOpenCanvasCenterTab(shapeId, source.context);

  const handleOpenReviewFile = React.useCallback(
    (args: ReviewViewOpenFileArgs) => {
      openCenterTab(
        createCanvasCenterTab({
          kind: "review-group",
          title: t("reviewWidget.review"),
          groupPath: args.groupPath,
          diffFilePath: args.filePath,
          line: args.line,
          reviewCommentGuid: args.reviewCommentGuid,
          reviewMessageGuid: args.reviewMessageGuid,
          revisionGuid: args.groupPath.startsWith(EDITOR_REVIEW_GROUP_PREFIX)
            ? args.groupPath.slice(EDITOR_REVIEW_GROUP_PREFIX.length)
            : source.revisionGuid,
          reviewSessionGuid: source.sessionGuid,
        }),
      );
    },
    [openCenterTab, source.revisionGuid, source.sessionGuid, t],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center bg-background/50 backdrop-blur-sm">
        <ReviewActions />
      </div>
      <div className="min-h-0 flex-1">
        <ReviewView
          contextId={contextId}
          onOpenReviewFile={handleOpenReviewFile}
        />
      </div>
    </div>
  );
}
