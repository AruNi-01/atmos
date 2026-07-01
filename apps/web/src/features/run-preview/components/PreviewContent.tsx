"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@workspace/ui";
import { PreviewToolbar } from "./PreviewToolbar";
import { PreviewViewport } from "./PreviewViewport";

type PreviewContentProps = {
  browserTabBar?: React.ReactNode;
  isChromeHidden?: boolean;
  isMaximized: boolean;
  previewRootRef: React.RefObject<HTMLDivElement | null>;
  toolbarProps: React.ComponentProps<typeof PreviewToolbar>;
  toolbarHoverSuppressed?: boolean;
  viewportProps: React.ComponentProps<typeof PreviewViewport>;
};

export function PreviewContent({
  browserTabBar,
  isChromeHidden = false,
  isMaximized,
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

  const content = (
    <div
      ref={previewRootRef}
      className={cn(
        "flex flex-col overflow-hidden bg-background transition-all duration-300 ease-in-out",
        isMaximized
          ? "fixed inset-0 z-[1000] h-screen w-screen animate-in fade-in zoom-in-95 slide-in-from-bottom-2"
          : "h-full w-full",
      )}
    >
      {isChromeHidden ? (
        <div
          className={cn(
            "relative z-30 shrink-0 overflow-visible transition-[max-height] duration-300 ease-in-out",
            isChromeHovered ? "max-h-40" : "max-h-3",
            toolbarHoverSuppressed && "pointer-events-none",
          )}
          onMouseEnter={() => setIsChromeHovered(true)}
          onMouseLeave={() => setIsChromeHovered(false)}
          onPointerEnter={() => setIsChromeHovered(true)}
          onPointerLeave={() => setIsChromeHovered(false)}
        >
          <div
            className={cn(
              "relative inset-x-0 top-0 z-30 min-h-3 overflow-hidden rounded-b-md border-b border-border/70 bg-background/95 shadow-xl backdrop-blur-md transition-all duration-300 ease-in-out supports-[backdrop-filter]:bg-background/85",
              isChromeHovered ? "translate-y-0 opacity-100" : "-translate-y-[calc(100%-0.75rem)] opacity-0",
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

  if (isMaximized && typeof document !== "undefined") {
    return createPortal(content, document.body);
  }

  return content;
}
