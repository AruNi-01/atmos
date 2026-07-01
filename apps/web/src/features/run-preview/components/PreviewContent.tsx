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
  previewRootRef: React.RefObject<HTMLDivElement | null>;
  toolbarProps: React.ComponentProps<typeof PreviewToolbar>;
  toolbarHoverSuppressed?: boolean;
  viewportProps: React.ComponentProps<typeof PreviewViewport>;
};

export function PreviewContent({
  browserTabBar,
  isChromeHidden = false,
  isMaximized,
  isMaximizedLayoutManaged = false,
  previewRootRef,
  toolbarProps,
  toolbarHoverSuppressed = false,
  viewportProps,
}: PreviewContentProps) {
  const shouldPortalMaximizedLayout = isMaximized && !isMaximizedLayoutManaged;
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
  toolbarHoverSuppressed,
}: {
  children: React.ReactNode;
  toolbarHoverSuppressed: boolean;
}) {
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
