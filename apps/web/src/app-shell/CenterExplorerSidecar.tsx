"use client";

import React from "react";
import { cn } from "@/shared/lib/utils";
import {
  CENTER_EXPLORER_DEFAULT_WIDTH,
  clampCenterExplorerWidth,
  type CenterExplorerKind,
} from "@/app-shell/center-explorer-layout";

export function CenterExplorerSidecar({
  kind,
  width,
  takingSpace,
  interactive,
  style,
  onWidthChange,
  children,
}: {
  kind: CenterExplorerKind;
  width: number;
  takingSpace: boolean;
  interactive?: boolean;
  style?: React.CSSProperties;
  onWidthChange: (width: number) => void;
  children: React.ReactNode;
}) {
  const innerWidth = width > 0 ? width : CENTER_EXPLORER_DEFAULT_WIDTH;

  return (
    <div
      data-center-explorer={kind}
      data-center-explorer-open={takingSpace ? "true" : "false"}
      aria-hidden={!takingSpace}
      inert={!takingSpace ? true : undefined}
      className={cn(
        "absolute z-[2] flex min-h-0 overflow-hidden bg-background",
        takingSpace ? "border-l border-border" : "pointer-events-none",
        interactive && takingSpace && "pointer-events-auto",
      )}
      style={style}
    >
      {takingSpace ? (
        <div
          role="separator"
          aria-orientation="vertical"
          className="absolute inset-y-0 left-0 z-10 w-px cursor-col-resize bg-transparent before:absolute before:inset-y-0 before:-left-1 before:w-2 before:content-[''] hover:bg-border"
          onMouseDown={(event) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = innerWidth;
            const onMove = (moveEvent: MouseEvent) => {
              onWidthChange(
                clampCenterExplorerWidth(startWidth - (moveEvent.clientX - startX)),
              );
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />
      ) : null}
      <div
        className="flex h-full min-h-0 shrink-0 flex-col"
        style={{ width: innerWidth }}
      >
        {children}
      </div>
    </div>
  );
}
