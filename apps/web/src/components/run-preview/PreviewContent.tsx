"use client";

import type React from "react";

import { cn } from "@workspace/ui";
import { PreviewToolbar } from "./PreviewToolbar";
import { PreviewViewport } from "./PreviewViewport";

type PreviewContentProps = {
  isMaximized: boolean;
  previewRootRef: React.RefObject<HTMLDivElement | null>;
  toolbarProps: React.ComponentProps<typeof PreviewToolbar>;
  viewportProps: React.ComponentProps<typeof PreviewViewport>;
};

export function PreviewContent({
  isMaximized,
  previewRootRef,
  toolbarProps,
  viewportProps,
}: PreviewContentProps) {
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
      <PreviewToolbar {...toolbarProps} />
      <PreviewViewport {...viewportProps} />
    </div>
  );
}
