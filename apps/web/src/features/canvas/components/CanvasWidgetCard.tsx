"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { HTMLContainer, useEditor, useValue, type TLShapeId } from "tldraw";
import { ArrowUpRight, RefreshCcw, X } from "lucide-react";
import { cn } from "@workspace/ui";

import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  EDITOR_REVIEW_DIFF_PREFIX,
  EDITOR_REVIEW_GROUP_PREFIX,
  useEditorStore,
} from "@/features/editor/store/use-editor-store";
import { useCanvasRuntimeStore } from "@/features/canvas/store/canvas-runtime-store";
import {
  CanvasWidgetShapeSchemaUtil,
  getCanvasContextLabel,
  hasConcreteCanvasContext,
  type CanvasWidgetShape,
} from "@/features/canvas/lib/canvas-widget-shape";
import { CANVAS_WIDGET_REGISTRY } from "@/features/canvas/lib/canvas-widget-registry";
import { CanvasWorkspaceContextWidget } from "@/features/canvas/components/widgets/CanvasWorkspaceContextWidget";
import { CanvasFilesWidget } from "@/features/canvas/components/widgets/CanvasFilesWidget";
import { CanvasChangesWidget } from "@/features/canvas/components/widgets/CanvasChangesWidget";
import { CanvasReviewWidget } from "@/features/canvas/components/widgets/CanvasReviewWidget";
import { CanvasCenterWidget } from "@/features/canvas/components/widgets/CanvasCenterWidget";
import { CanvasBrowserWidget } from "@/features/canvas/components/widgets/CanvasBrowserWidget";
import { CanvasAgentStatusWidget } from "@/features/canvas/components/widgets/CanvasAgentStatusWidget";
import { CanvasAIQuotaUsageWidget } from "@/features/canvas/components/widgets/CanvasAIQuotaUsageWidget";
import { CanvasAgentChatWidget } from "@/features/canvas/components/widgets/CanvasAgentChatWidget";
import { CanvasWidgetHostProvider } from "@/features/canvas/components/CanvasWidgetHost";
import { CANVAS_CARD_CORNER_RADIUS } from "@/features/canvas/lib/canvas-shape-indicator";

export class CanvasWidgetShapeUtil extends CanvasWidgetShapeSchemaUtil {
  component(shape: CanvasWidgetShape) {
    return <CanvasWidgetCard shape={shape} />;
  }
}

function isCanvasSelectableTextTarget(target: EventTarget | null) {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  return Boolean(element?.closest('[data-canvas-selectable-text="true"]'));
}

function CanvasWidgetCard({ shape }: { shape: CanvasWidgetShape }) {
  return (
    <HTMLContainer
      id={shape.id}
      data-canvas-widget-surface="true"
      style={{
        width: shape.props.w,
        height: shape.props.h,
        pointerEvents: "all",
        cursor: "auto",
      }}
    >
      <CanvasWidgetCardInner shape={shape} />
    </HTMLContainer>
  );
}

function CanvasWidgetCardInner({ shape }: { shape: CanvasWidgetShape }) {
  const t = useTranslations("Canvas.chrome");
  const editor = useEditor();
  const router = useAppRouter();
  const openFile = useEditorStore((state) => state.openFile);
  const setActiveShapeId = useCanvasRuntimeStore((state) => state.setActiveShapeId);
  const activeShapeId = useCanvasRuntimeStore((state) => state.activeShapeId);
  const widgetBodyRef = React.useRef<HTMLDivElement | null>(null);
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const registry = CANVAS_WIDGET_REGISTRY[shape.props.widgetType];
  const Icon = registry.icon;
  const title =
    shape.props.source.type === "center" && shape.props.title === "Center"
      ? registry.label
      : shape.props.title;
  const canRefreshWidget = shape.props.source.type !== "center";
  const canRevealSource = hasConcreteCanvasContext(shape.props.source.context);
  const isSelected = useValue(
    "canvas-widget-selected",
    () => editor.getSelectedShapeIds().includes(shape.id as TLShapeId),
    [editor, shape.id],
  );
  const isActive = activeShapeId === shape.id;

  const activateWidget = React.useCallback(() => {
    setActiveShapeId(shape.id);
    editor.select(shape.id as TLShapeId);
  }, [editor, setActiveShapeId, shape.id]);

  const markWidgetInteractionHandled = React.useCallback(
    (event: React.SyntheticEvent) => {
      editor.markEventAsHandled(event);
      if (isCanvasSelectableTextTarget(event.target)) {
        return;
      }
      activateWidget();
    },
    [activateWidget, editor],
  );

  const stopCanvasInteractionWhileActive = React.useCallback(
    (event: React.SyntheticEvent) => {
      if (!isActive && !isCanvasSelectableTextTarget(event.target)) {
        return;
      }
      editor.markEventAsHandled(event);
    },
    [editor, isActive],
  );

  React.useEffect(() => {
    const body = widgetBodyRef.current;
    if (!body) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      editor.markEventAsHandled(event);
      event.stopPropagation();
    };

    body.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      body.removeEventListener("wheel", handleWheel);
    };
  }, [editor]);

  const handleRevealSource = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const source = shape.props.source;
      const context = source.context;
      const id = context.contextScope === "project" ? context.projectId : context.workspaceId;
      if (!id) {
        return;
      }
      if (source.type === "center") {
        const activeTab =
          source.tabs.find((tab) => tab.id === source.activeTabId) ?? source.tabs[0] ?? null;
        if (activeTab) {
          if (activeTab.kind === "file") {
            void openFile(activeTab.path, id, {
              preview: false,
              line: activeTab.line,
              column: activeTab.column,
            });
          } else if (activeTab.kind === "changes-group") {
            void openFile(activeTab.groupPath, id, { preview: false });
          } else if (activeTab.kind === "changes-file") {
            void openFile(activeTab.filePath, id, { preview: false });
          } else if (activeTab.kind === "review-group") {
            void openFile(
              activeTab.groupPath || `${EDITOR_REVIEW_GROUP_PREFIX}${activeTab.revisionGuid ?? ""}`,
              id,
              { preview: false },
            );
          } else if (activeTab.kind === "review-file") {
            void openFile(
              activeTab.originalPath ||
                `${EDITOR_REVIEW_DIFF_PREFIX}${activeTab.revisionGuid ?? ""}/${activeTab.filePath}`,
              id,
              { preview: false },
            );
          }
        }
      }
      const params = new URLSearchParams();
      params.set("id", id);
      router.push(`/${context.contextScope}?${params.toString()}`);
    },
    [openFile, router, shape.props.source],
  );

  const handleClose = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      editor.deleteShapes([shape.id as TLShapeId]);
      if (activeShapeId === shape.id) {
        setActiveShapeId(null);
      }
    },
    [activeShapeId, editor, setActiveShapeId, shape.id],
  );

  const renderBody = () => {
    switch (shape.props.source.type) {
      case "workspace-context":
        return <CanvasWorkspaceContextWidget key={refreshNonce} shape={shape} />;
      case "files":
        return <CanvasFilesWidget key={refreshNonce} shape={shape} />;
      case "changes":
        return <CanvasChangesWidget key={refreshNonce} shape={shape} />;
      case "review":
        return <CanvasReviewWidget key={refreshNonce} shape={shape} />;
      case "center":
        return <CanvasCenterWidget shape={shape} />;
      case "browser":
        return <CanvasBrowserWidget shape={shape} />;
      case "agent-status":
        return <CanvasAgentStatusWidget key={refreshNonce} shape={shape} />;
      case "ai-quota-usage":
        return <CanvasAIQuotaUsageWidget key={refreshNonce} shape={shape} />;
      case "agent-chat":
        return <CanvasAgentChatWidget key={refreshNonce} shape={shape} />;
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden border bg-background text-foreground shadow-sm",
        isSelected ? "border-transparent" : "border-border",
      )}
      style={{ borderRadius: CANVAS_CARD_CORNER_RADIUS }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b border-border/70 bg-background px-4 py-3"
        onPointerDown={activateWidget}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {title}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {getCanvasContextLabel(shape.props.source.context)}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canRefreshWidget ? (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setRefreshNonce((value) => value + 1);
              }}
              aria-label={t("widgetCard.refreshWidget")}
              title={t("common.refresh")}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <RefreshCcw className="size-3.5" />
            </button>
          ) : null}
          {canRevealSource ? (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleRevealSource}
              aria-label={t("widgetCard.openSource")}
              title={t("common.source")}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowUpRight className="size-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleClose}
            aria-label={t("widgetCard.closeWidget")}
            title={t("common.close")}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/12 hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div
        ref={widgetBodyRef}
        className="min-h-0 flex-1 overflow-hidden bg-background"
        style={{ overscrollBehavior: "contain" }}
        onPointerDown={markWidgetInteractionHandled}
        onPointerMove={stopCanvasInteractionWhileActive}
        onPointerUp={stopCanvasInteractionWhileActive}
        onClick={markWidgetInteractionHandled}
        onContextMenu={markWidgetInteractionHandled}
        onDoubleClick={markWidgetInteractionHandled}
        onMouseDown={markWidgetInteractionHandled}
        onKeyDown={stopCanvasInteractionWhileActive}
      >
        <CanvasWidgetHostProvider widgetLabel={title}>{renderBody()}</CanvasWidgetHostProvider>
      </div>
    </div>
  );
}
