"use client";

import { useMemo } from "react";
import type React from "react";
import { useTranslations } from "next-intl";
import { MessageCirclePlus, Pencil, Trash2 } from "lucide-react";

import { cn } from "@workspace/ui";
import { SelectionPopover } from "@/features/selection/components/SelectionPopover";
import type { SelectionInfo } from "@/shared/lib/format-selection-for-ai";
import type { PreviewTransportMode } from "../lib/preview-bridge/types";
import type { PreviewSelectionAnnotation } from "../hooks/use-preview-selection";
import {
  renderPreviewErrorCard,
  renderPreviewLoadingOverlay,
  type PreviewLoadError,
} from "../lib/preview-utils";
import type { PreviewViewMode } from "@/shared/lib/nuqs/searchParams";
import { PreviewHome } from "./PreviewHome";

type PreviewViewportProps = {
  activeUrl: string;
  desktopViewportRef: React.RefObject<HTMLDivElement | null>;
  dismissSelectionPopover: (resetPreviewSelection?: boolean) => void;
  favoritesListOpen: boolean;
  handleIframeLoad: () => void;
  handleRefresh: () => void;
  iframeKey: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  iframeSrc: string;
  isDesktopNativePreviewOccluded: boolean;
  isPreviewLoading: boolean;
  onCloseFavoritesList: () => void;
  onAddSelectionAnnotation: (selectionInfo: SelectionInfo, note?: string) => void;
  onDeleteSelectionAnnotation: (annotationId?: string) => void;
  onDismissElementPickerTooltip: () => void;
  onEditSelectionAnnotation: (annotation: PreviewSelectionAnnotation) => void;
  onUpdateSelectionAnnotation: (selectionInfo: SelectionInfo, note?: string) => void;
  preferredTransportMode: PreviewTransportMode | "unavailable";
  projectId?: string | null;
  previewLoadError: PreviewLoadError | null;
  requestedIframeUrl: string;
  resolvedTransportMode: PreviewTransportMode | "unavailable";
  selectionAnnotations: PreviewSelectionAnnotation[];
  editingAnnotationId: string | null;
  selectionInfo: SelectionInfo | null;
  selectionPopoverExpanded: boolean;
  selectionPopoverPosition: { x: number; y: number };
  selectionPopoverRef: React.RefObject<HTMLDivElement | null>;
  selectionPopoverVisible: boolean;
  setSelectionPopoverExpanded: (expanded: boolean) => void;
  shouldStackPreviewHomeCards: boolean;
  workspaceId?: string | null;
  onOpenLocalServiceUrl: (url: string) => void;
  transportMessage: string;
  viewMode: PreviewViewMode;
};

export function PreviewViewport({
  activeUrl,
  desktopViewportRef,
  dismissSelectionPopover,
  favoritesListOpen,
  handleIframeLoad,
  handleRefresh,
  iframeKey,
  iframeRef,
  iframeSrc,
  isDesktopNativePreviewOccluded,
  isPreviewLoading,
  onCloseFavoritesList,
  onAddSelectionAnnotation,
  onDeleteSelectionAnnotation,
  onDismissElementPickerTooltip,
  onEditSelectionAnnotation,
  onUpdateSelectionAnnotation,
  preferredTransportMode,
  projectId,
  previewLoadError,
  requestedIframeUrl,
  resolvedTransportMode,
  selectionAnnotations,
  editingAnnotationId,
  selectionInfo,
  selectionPopoverExpanded,
  selectionPopoverPosition,
  selectionPopoverRef,
  selectionPopoverVisible,
  setSelectionPopoverExpanded,
  shouldStackPreviewHomeCards,
  workspaceId,
  onOpenLocalServiceUrl,
  transportMessage,
  viewMode,
}: PreviewViewportProps) {
  const desktopNativeT = useTranslations("runPreview.preview.desktopNative");
  const displayActiveUrl = useMemo(() => {
    if (!activeUrl) return "";
    try {
      const parsed = new URL(activeUrl);
      const path = parsed.pathname === "/" ? "" : parsed.pathname;
      return `${parsed.host}${path}`;
    } catch {
      return activeUrl;
    }
  }, [activeUrl]);
  const annotationOverlays = resolvedTransportMode === "desktop-native"
    ? []
    : selectionAnnotations.flatMap((annotation) => {
      const rect = annotation.info.previewRect;
      if (!rect) return [];
      return [{
        annotation,
        rect,
        left: rect.x,
        top: rect.y,
        width: Math.max(2, rect.width),
        height: Math.max(2, rect.height),
      }];
    });

  return (
    <div
      className="relative flex flex-1 justify-center overflow-hidden"
      onPointerEnter={onDismissElementPickerTooltip}
      onMouseEnter={onDismissElementPickerTooltip}
    >
      {resolvedTransportMode !== "desktop-native" ? (
        <SelectionPopover
          isVisible={selectionPopoverVisible}
          position={selectionPopoverPosition}
          selectionInfo={selectionInfo}
          isExpanded={selectionPopoverExpanded}
          onExpand={() => setSelectionPopoverExpanded(true)}
          onDismiss={dismissSelectionPopover}
          type="preview"
          popoverRef={selectionPopoverRef}
          positioning="fixed"
          annotationMode={editingAnnotationId ? "edit" : "add"}
          initialNote={
            editingAnnotationId
              ? selectionAnnotations.find((annotation) => annotation.id === editingAnnotationId)?.note ?? ""
              : ""
          }
          onAddAnnotation={onAddSelectionAnnotation}
          onUpdateAnnotation={onUpdateSelectionAnnotation}
        />
      ) : null}
      {favoritesListOpen ? (
        <button
          type="button"
          aria-label="Close favorites"
          className="absolute inset-0 z-10 cursor-default bg-transparent"
          onClick={onCloseFavoritesList}
        />
      ) : null}
      {activeUrl ? (
        previewLoadError && !isPreviewLoading ? (
          renderPreviewErrorCard(previewLoadError, handleRefresh)
        ) : preferredTransportMode === "desktop-native" ? (
          <div
            ref={desktopViewportRef}
            className={cn(
              "flex h-full w-full flex-col items-center justify-center gap-3 border border-dashed border-border/60 px-6 text-center select-none",
              isDesktopNativePreviewOccluded ? "bg-background/90" : "bg-muted/10",
              viewMode === "mobile" ? "w-[375px]" : "w-full",
            )}
          >
            {isDesktopNativePreviewOccluded ? (
              <>
                <div className="text-sm font-medium text-foreground">
                  {desktopNativeT("occludedTitle")}
                </div>
                <div className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                  {desktopNativeT("occludedDescription")}
                </div>
              </>
            ) : null}
            {isDesktopNativePreviewOccluded && displayActiveUrl ? (
              <div className="max-w-xl truncate text-[11px] leading-relaxed text-muted-foreground/80">
                {displayActiveUrl}
              </div>
            ) : null}
            {transportMessage ? (
              <div className="max-w-xl text-[11px] leading-relaxed text-muted-foreground">
                {transportMessage}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              "relative h-full",
              viewMode === "mobile" ? "w-[375px]" : "w-full",
            )}
          >
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={iframeSrc}
              onLoad={handleIframeLoad}
              style={{ colorScheme: "dark" }}
              className={cn(
                "block h-full w-full border-0 bg-white outline-none transition-all duration-300",
                ((requestedIframeUrl && requestedIframeUrl !== iframeSrc) || isPreviewLoading || previewLoadError) &&
                  "pointer-events-none opacity-0",
                viewMode === "mobile" && "border-x border-border shadow-sm",
              )}
              title="Preview"
            />
            {isPreviewLoading ? renderPreviewLoadingOverlay(viewMode) : null}
            {annotationOverlays.map(({ annotation, rect, left, top, width, height }) => (
              <div key={annotation.id} className="pointer-events-none absolute inset-0 z-20">
                <div
                  className="absolute rounded-md border-2 border-emerald-500 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]"
                  style={{ left, top, width, height }}
                />
                <div
                  className="group absolute flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border border-white/70 bg-emerald-500 text-white shadow-lg shadow-slate-950/25 transition-[width,background-color,border-color] duration-200 ease-out hover:w-[124px] hover:border-emerald-400/50 hover:bg-slate-950/95"
                  style={{
                    left: Math.max(6, left - 6),
                    top: Math.max(6, top - 14),
                    pointerEvents: "auto",
                  }}
                >
                  <MessageCirclePlus className="size-3.5 transition-all duration-150 group-hover:scale-75 group-hover:opacity-0" />
                  <div className="absolute inset-0 flex translate-x-[-4px] items-center justify-center opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100">
                    <button
                      type="button"
                      className="inline-flex h-full flex-1 items-center justify-center gap-1 rounded-none px-0 text-[11px] font-semibold text-slate-100 transition-colors duration-150 ease-out hover:bg-white/10 hover:text-white active:bg-white/15"
                      aria-label="Edit annotation"
                      onClick={() => {
                        onEditSelectionAnnotation({
                          ...annotation,
                          info: {
                            ...annotation.info,
                            previewRect: rect,
                          },
                        });
                      }}
                    >
                      <Pencil className="size-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-full flex-1 items-center justify-center gap-1 rounded-none px-0 text-[11px] font-semibold text-slate-100 transition-colors duration-150 ease-out hover:bg-red-500/20 hover:text-red-100 active:bg-red-500/25"
                      aria-label="Delete annotation"
                      onClick={() => onDeleteSelectionAnnotation(annotation.id)}
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <PreviewHome
          projectId={projectId}
          workspaceId={workspaceId}
          shouldStackPreviewHomeCards={shouldStackPreviewHomeCards}
          onOpenUrl={onOpenLocalServiceUrl}
        />
      )}
    </div>
  );
}
