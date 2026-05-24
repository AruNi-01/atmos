"use client";

import type React from "react";

import { cn } from "@workspace/ui";
import { SelectionPopover } from "@/features/selection/components/SelectionPopover";
import type { SelectionInfo } from "@/shared/lib/format-selection-for-ai";
import type { PreviewTransportMode } from "../lib/preview-bridge/types";
import {
  renderPreviewErrorCard,
  renderPreviewHome,
  renderPreviewLoadingOverlay,
  type PreviewLoadError,
} from "../lib/preview-utils";
import type { PreviewViewMode } from "@/shared/lib/nuqs/searchParams";

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
  isPreviewLoading: boolean;
  onCloseFavoritesList: () => void;
  onDismissElementPickerTooltip: () => void;
  preferredTransportMode: PreviewTransportMode | "unavailable";
  previewLoadError: PreviewLoadError | null;
  requestedIframeUrl: string;
  resolvedTransportMode: PreviewTransportMode | "unavailable";
  selectionInfo: SelectionInfo | null;
  selectionPopoverExpanded: boolean;
  selectionPopoverPosition: { x: number; y: number };
  selectionPopoverRef: React.RefObject<HTMLDivElement | null>;
  selectionPopoverVisible: boolean;
  setSelectionPopoverExpanded: (expanded: boolean) => void;
  shouldStackPreviewHomeCards: boolean;
  shouldStackPreviewHomeNotes: boolean;
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
  isPreviewLoading,
  onCloseFavoritesList,
  onDismissElementPickerTooltip,
  preferredTransportMode,
  previewLoadError,
  requestedIframeUrl,
  resolvedTransportMode,
  selectionInfo,
  selectionPopoverExpanded,
  selectionPopoverPosition,
  selectionPopoverRef,
  selectionPopoverVisible,
  setSelectionPopoverExpanded,
  shouldStackPreviewHomeCards,
  shouldStackPreviewHomeNotes,
  transportMessage,
  viewMode,
}: PreviewViewportProps) {
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
              "flex h-full w-full flex-col items-center justify-center gap-3 border border-dashed border-border/60 bg-muted/10 px-6 text-center select-none",
              viewMode === "mobile" ? "w-[375px]" : "w-full",
            )}
          >
            <div className="text-sm font-medium text-foreground">Desktop native preview active</div>
            <div className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              The page is rendered in a Tauri-managed preview window so cross-port and iframe-blocked pages can still use element selection and source-component detection.
            </div>
            {transportMessage ? (
              <div className="max-w-xl text-[11px] leading-relaxed text-muted-foreground">
                {transportMessage}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={iframeSrc}
              onLoad={handleIframeLoad}
              style={{ colorScheme: "dark" }}
              className={cn(
                "block h-full border-0 bg-white outline-none transition-all duration-300",
                ((requestedIframeUrl && requestedIframeUrl !== iframeSrc) || isPreviewLoading || previewLoadError) &&
                  "pointer-events-none opacity-0",
                viewMode === "mobile" ? "w-[375px] border-x border-border shadow-sm" : "w-full",
              )}
              title="Preview"
            />
            {isPreviewLoading ? renderPreviewLoadingOverlay(viewMode) : null}
          </>
        )
      ) : (
        renderPreviewHome(shouldStackPreviewHomeCards, shouldStackPreviewHomeNotes)
      )}
    </div>
  );
}
