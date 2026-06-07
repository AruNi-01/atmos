"use client";

import React, { useState } from "react";

import { cn } from "@workspace/ui";
import { PreviewToolbar } from "./PreviewToolbar";
import { PreviewViewport } from "./PreviewViewport";

type PreviewContentProps = {
  browserTabBar?: React.ReactNode;
  isChromeHidden?: boolean;
  isMaximized: boolean;
  needsChromeSafeInset?: boolean;
  previewRootRef: React.RefObject<HTMLDivElement | null>;
  toolbarProps: React.ComponentProps<typeof PreviewToolbar>;
  toolbarHoverSuppressed?: boolean;
  viewportProps: React.ComponentProps<typeof PreviewViewport>;
};

export function PreviewContent({
  browserTabBar,
  isChromeHidden = false,
  isMaximized,
  needsChromeSafeInset = false,
  previewRootRef,
  toolbarProps,
  toolbarHoverSuppressed = false,
  viewportProps,
}: PreviewContentProps) {
  const [isChromeHovered, setIsChromeHovered] = useState(false);
  const chrome = (
    <>
      {browserTabBar}
      <PreviewToolbar {...toolbarProps} />
    </>
  );

  return (
    <div
      ref={previewRootRef}
      className={cn(
        "flex flex-col overflow-hidden bg-background transition-all duration-300 ease-in-out",
        isMaximized
          ? "fixed inset-0 z-50 h-screen w-screen animate-in fade-in zoom-in-95 slide-in-from-bottom-2"
          : "h-full w-full",
      )}
    >
      {isChromeHidden ? (
        <div
          className={cn(
            "relative z-20 h-3 shrink-0 overflow-visible",
            needsChromeSafeInset && "pt-8",
            toolbarHoverSuppressed && "pointer-events-none",
          )}
          onMouseEnter={() => setIsChromeHovered(true)}
          onMouseLeave={() => setIsChromeHovered(false)}
          onPointerEnter={() => setIsChromeHovered(true)}
          onPointerLeave={() => setIsChromeHovered(false)}
        >
          <div
            className={cn(
              "absolute inset-x-0 top-0 z-20 shadow-lg transition-all duration-300 ease-in-out",
              isChromeHovered ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0",
              needsChromeSafeInset && "top-8",
            )}
          >
            {chrome}
          </div>
        </div>
      ) : (
        chrome
      )}
      <PreviewViewport {...viewportProps} />
    </div>
  );
}
