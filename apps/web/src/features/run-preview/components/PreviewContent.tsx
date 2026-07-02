"use client";

import React from "react";
import { createPortal } from "react-dom";

import { cn } from "@workspace/ui";
import { PreviewToolbar } from "./PreviewToolbar";
import { PreviewViewport } from "./PreviewViewport";

type PreviewContentProps = {
  browserTabBar?: React.ReactNode;
  isChromeHidden?: boolean;
  isMaximized: boolean;
  isMaximizedLayoutManaged?: boolean;
  onNativeSurfaceChromeLayoutChange?: () => void;
  previewRootRef: React.RefObject<HTMLDivElement | null>;
  reserveNativeSurfaceChromeSpace?: boolean;
  toolbarProps: React.ComponentProps<typeof PreviewToolbar>;
  toolbarHoverSuppressed?: boolean;
  viewportProps: React.ComponentProps<typeof PreviewViewport>;
};

export function PreviewContent({
  browserTabBar,
  isChromeHidden = false,
  isMaximized,
  isMaximizedLayoutManaged = false,
  onNativeSurfaceChromeLayoutChange,
  previewRootRef,
  reserveNativeSurfaceChromeSpace = false,
  toolbarProps,
  toolbarHoverSuppressed = false,
  viewportProps,
}: PreviewContentProps) {
  const shouldPortalMaximizedLayout = isMaximized && !isMaximizedLayoutManaged;
  // Tauri child webviews sit above the parent DOM, so hidden chrome must reserve
  // layout space instead of relying on z-index when previewing external pages.
  const shouldReserveNativeChromeSpace =
    isChromeHidden && reserveNativeSurfaceChromeSpace;
  const chrome = (
    <>
      {browserTabBar}
      <PreviewToolbar {...toolbarProps} />
    </>
  );

  const content = (
    <div
      ref={previewRootRef}
      className={cn(
        "flex flex-col overflow-hidden bg-background transition-all duration-300 ease-in-out",
        shouldPortalMaximizedLayout
          ? "fixed inset-0 z-[1000] h-screen w-screen animate-in fade-in zoom-in-95 slide-in-from-bottom-2"
          : "h-full w-full",
      )}
    >
      {isChromeHidden ? (
        <HiddenPreviewChrome
          key={toolbarHoverSuppressed ? "suppressed" : "ready"}
          onNativeSurfaceChromeLayoutChange={onNativeSurfaceChromeLayoutChange}
          reserveNativeSurfaceSpace={shouldReserveNativeChromeSpace}
          toolbarHoverSuppressed={toolbarHoverSuppressed}
        >
          {chrome}
        </HiddenPreviewChrome>
      ) : (
        chrome
      )}
      <PreviewViewport {...viewportProps} />
    </div>
  );

  if (shouldPortalMaximizedLayout && typeof document !== "undefined") {
    return createPortal(content, document.body);
  }

  return content;
}

function HiddenPreviewChrome({
  children,
  onNativeSurfaceChromeLayoutChange,
  reserveNativeSurfaceSpace,
  toolbarHoverSuppressed,
}: {
  children: React.ReactNode;
  onNativeSurfaceChromeLayoutChange?: () => void;
  reserveNativeSurfaceSpace: boolean;
  toolbarHoverSuppressed: boolean;
}) {
  if (reserveNativeSurfaceSpace) {
    return (
      <div
        onBlurCapture={onNativeSurfaceChromeLayoutChange}
        onFocusCapture={onNativeSurfaceChromeLayoutChange}
        onMouseEnter={onNativeSurfaceChromeLayoutChange}
        onMouseLeave={onNativeSurfaceChromeLayoutChange}
        className={cn(
          "group/preview-chrome relative z-30 shrink-0 overflow-visible",
          toolbarHoverSuppressed && "pointer-events-none",
        )}
      >
        <div
          onTransitionEnd={onNativeSurfaceChromeLayoutChange}
          className={cn(
            "max-h-4 min-h-4 overflow-hidden rounded-b-md border-b border-border/70 bg-background/95 opacity-0 shadow-xl backdrop-blur-md transition-all duration-300 ease-in-out supports-[backdrop-filter]:bg-background/85",
            "group-hover/preview-chrome:max-h-40 group-hover/preview-chrome:opacity-100 group-focus-within/preview-chrome:max-h-40 group-focus-within/preview-chrome:opacity-100",
          )}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group/preview-chrome relative z-30 h-4 shrink-0 overflow-visible",
        toolbarHoverSuppressed && "pointer-events-none",
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-30 min-h-4 overflow-hidden rounded-b-md border-b border-border/70 bg-background/95 opacity-0 shadow-xl backdrop-blur-md transition-all duration-300 ease-in-out supports-[backdrop-filter]:bg-background/85",
          "-translate-y-[calc(100%-1rem)] group-hover/preview-chrome:translate-y-0 group-hover/preview-chrome:opacity-100",
        )}
      >
        {children}
      </div>
    </div>
  );
}
