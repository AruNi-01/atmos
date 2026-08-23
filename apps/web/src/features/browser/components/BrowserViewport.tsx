"use client";

import type React from "react";
import { useMemo } from "react";
import { MessageCirclePlus, Pencil, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";

import { cn, NativeFollowCursor } from "@workspace/ui";
import { SelectionPopover } from "@/features/selection/components/SelectionPopover";
import type { SelectionInfo } from "@/shared/lib/format-selection-for-ai";
import type { BrowserTransportMode } from "../lib/browser-bridge/types";
import type { PreviewSelectionAnnotation } from "../hooks/use-browser-selection";
import {
  renderPreviewErrorCard,
  type PreviewLoadError,
} from "../lib/browser-utils";
import { mapGuestRectToShellLocal } from "../lib/map-guest-rect";
import type { PreviewViewMode } from "@/shared/lib/nuqs/searchParams";
import type { DesktopBrowserAttachConfig } from "../lib/browser-transports/desktop-transport";
import { BrowserHome } from "./BrowserHome";
import { BROWSER_Z, DesktopBrowserWebview } from "./DesktopBrowserWebview";

type BrowserViewportProps = {
  activeUrl: string;
  desktopViewportRef: React.RefObject<HTMLDivElement | null>;
  desktopAttach: DesktopBrowserAttachConfig | null;
  desktopSrc: string;
  desktopPointerEventsNone?: boolean;
  desktopLayoutHidden?: boolean;
  onDesktopBindGuest?: (webContentsId: number) => void;
  onDesktopLoadingChange?: (loading: boolean) => void;
  dismissSelectionPopover: (resetBrowserSelection?: boolean) => void;
  favoritesListOpen: boolean;
  handleIframeLoad: () => void;
  handleRefresh: () => void;
  iframeKey: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  iframeSrc: string;
  hoverCursorLabel: {
    label: string;
    x: number;
    y: number;
  } | null;
  isPreviewLoading: boolean;
  onCloseFavoritesList: () => void;
  onAddSelectionAnnotation: (selectionInfo: SelectionInfo, note?: string) => void;
  onDeleteSelectionAnnotation: (annotationId?: string) => void;
  onDismissElementPickerTooltip: () => void;
  onEditSelectionAnnotation: (annotation: PreviewSelectionAnnotation) => void;
  onUpdateSelectionAnnotation: (selectionInfo: SelectionInfo, note?: string) => void;
  preferredTransportMode: BrowserTransportMode | "unavailable";
  projectId?: string | null;
  previewLoadError: PreviewLoadError | null;
  requestedIframeUrl: string;
  resolvedTransportMode: BrowserTransportMode | "unavailable";
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

export function BrowserViewport({
  activeUrl,
  desktopViewportRef,
  desktopAttach,
  desktopSrc,
  desktopPointerEventsNone = false,
  desktopLayoutHidden = false,
  onDesktopBindGuest,
  onDesktopLoadingChange,
  dismissSelectionPopover,
  favoritesListOpen,
  handleIframeLoad,
  handleRefresh,
  iframeKey,
  iframeRef,
  iframeSrc,
  hoverCursorLabel,
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
}: BrowserViewportProps) {
  void activeUrl;
  const { resolvedTheme } = useTheme();
  // Follow Atmos theme for nested frame color-scheme (scrollbars / controls).
  const guestColorScheme = resolvedTheme === "light" ? "light" : "dark";
  const hasIframeSrc = iframeSrc.trim().length > 0;
  const isDesktop = preferredTransportMode === "desktop";

  // Guest client rects → shell-local absolute positions so pins track webview content.
  const annotationOverlays = useMemo(() => {
    const shell = isDesktop
      ? desktopViewportRef.current
      : (iframeRef.current?.parentElement as HTMLElement | null);
    const frame = isDesktop
      ? ((shell?.querySelector("webview") as HTMLElement | null) ?? shell)
      : iframeRef.current;

    return selectionAnnotations.flatMap((annotation) => {
      const rect = annotation.info.previewRect;
      if (!rect) return [];
      const mapped = mapGuestRectToShellLocal(rect, frame, shell);
      // Hide pins that have scrolled fully out of the shell viewport.
      if (
        mapped.y + mapped.height < -4 ||
        mapped.x + mapped.width < -4 ||
        (shell && mapped.y > shell.clientHeight + 4) ||
        (shell && mapped.x > shell.clientWidth + 4)
      ) {
        return [];
      }
      return [{
        annotation,
        rect: mapped,
        left: mapped.x,
        top: mapped.y,
        width: Math.max(2, mapped.width),
        height: Math.max(2, mapped.height),
      }];
    });
  }, [desktopViewportRef, iframeRef, isDesktop, selectionAnnotations]);

  const selectionPopover = (
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
  );

  const annotationLayer = annotationOverlays.map(({ annotation, rect, left, top, width, height }) => (
    <div
      key={annotation.id}
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: BROWSER_Z.selection }}
    >
      <div
        className="absolute rounded-md border-2 border-emerald-500 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]"
        style={{ left, top, width, height }}
      />
      <div
        className="group absolute flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border border-white/70 bg-emerald-500 text-white shadow-lg shadow-slate-950/25 transition-[width] duration-200 ease-out hover:w-[124px] hover:border-emerald-400/50 hover:bg-slate-950/95"
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
            className="inline-flex h-full flex-1 items-center justify-center gap-1 rounded-none px-0 text-[11px] font-semibold text-slate-100 hover:bg-white/10 hover:text-white active:bg-white/15"
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
            className="inline-flex h-full flex-1 items-center justify-center gap-1 rounded-none px-0 text-[11px] font-semibold text-slate-100 hover:bg-red-500/20 hover:text-red-100 active:bg-red-500/25"
            aria-label="Delete annotation"
            onClick={() => onDeleteSelectionAnnotation(annotation.id)}
          >
            <Trash2 className="size-3" />
            Delete
          </button>
        </div>
      </div>
    </div>
  ));

  return (
    <div
      className="relative flex flex-1 justify-center overflow-hidden"
      onPointerEnter={onDismissElementPickerTooltip}
      onMouseEnter={onDismissElementPickerTooltip}
    >
      {selectionPopover}
      {favoritesListOpen ? (
        <button
          type="button"
          aria-label="Close favorites"
          className="absolute inset-0 z-10 cursor-default bg-transparent"
          onClick={onCloseFavoritesList}
        />
      ) : null}
      <NativeFollowCursor
        active={Boolean(hoverCursorLabel)}
        label={hoverCursorLabel?.label ?? ""}
        point={hoverCursorLabel ? { x: hoverCursorLabel.x, y: hoverCursorLabel.y } : null}
      />
      {activeUrl ? (
        previewLoadError && !isPreviewLoading ? (
          renderPreviewErrorCard(previewLoadError, handleRefresh)
        ) : isDesktop ? (
          <div
            ref={desktopViewportRef}
            className={cn(
              "relative h-full w-full overflow-hidden bg-muted/10",
              viewMode === "mobile" ? "w-[375px]" : "w-full",
            )}
          >
            <DesktopBrowserWebview
              attach={desktopAttach}
              src={desktopSrc}
              pointerEventsNone={desktopPointerEventsNone}
              layoutHidden={desktopLayoutHidden}
              onBindGuest={onDesktopBindGuest}
              onLoadingChange={onDesktopLoadingChange}
            />
            {annotationLayer}
            {transportMessage ? (
              <div
                className="pointer-events-none absolute bottom-3 left-1/2 max-w-xl -translate-x-1/2 truncate text-center text-[11px] leading-relaxed text-muted-foreground"
                style={{ zIndex: BROWSER_Z.insetChrome }}
              >
                {transportMessage}
              </div>
            ) : null}
          </div>
        ) : hasIframeSrc ? (
          <div
            className={cn(
              "relative h-full",
              viewMode === "mobile" ? "w-[375px]" : "w-full",
            )}
          >
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={iframeSrc || undefined}
              onLoad={handleIframeLoad}
              // Guest Permissions Policy: clipboard + media for local preview UX
              // (Next.js Copy, getUserMedia). Notifications stay host/desktop-gated.
              allow="clipboard-read; clipboard-write; camera; microphone"
              style={{
                colorScheme: guestColorScheme,
                backgroundColor: guestColorScheme === "dark" ? "#0a0a0a" : "#ffffff",
              }}
              className={cn(
                "block h-full w-full border-0 outline-none transition-all duration-300",
                guestColorScheme === "dark" ? "bg-neutral-950" : "bg-white",
                ((requestedIframeUrl && requestedIframeUrl !== iframeSrc) || previewLoadError) &&
                  "pointer-events-none opacity-0",
                viewMode === "mobile" && "border-x border-border shadow-sm",
              )}
              title="Browser"
            />
            {annotationLayer}
          </div>
        ) : (
          <BrowserHome
            projectId={projectId}
            workspaceId={workspaceId}
            shouldStackPreviewHomeCards={shouldStackPreviewHomeCards}
            onOpenUrl={onOpenLocalServiceUrl}
          />
        )
      ) : (
        <BrowserHome
          projectId={projectId}
          workspaceId={workspaceId}
          shouldStackPreviewHomeCards={shouldStackPreviewHomeCards}
          onOpenUrl={onOpenLocalServiceUrl}
        />
      )}
    </div>
  );
}
