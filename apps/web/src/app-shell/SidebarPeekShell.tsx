"use client";

import React from "react";

import { cn } from "@/shared/lib/utils";
import {
  SIDEBAR_PEEK_CONTENT_PT_CLASS,
  SIDEBAR_PEEK_INSET_BOTTOM_PX,
  SIDEBAR_PEEK_INSET_TOP_PX,
} from "@/app-shell/sidebar-layout-constants";
import { useSidebarPeekVisibility } from "@/app-shell/use-sidebar-peek-visibility";

const SIDEBAR_PEEK_HIT_AREA_PX = 5;

interface SidebarPeekShellProps {
  side: "left" | "right";
  collapsed: boolean;
  widthPx: number | null;
  children: React.ReactNode;
}

export function getSidebarPeekOverlayWidthPx(rootWidth: number, size: number) {
  if (!Number.isFinite(rootWidth) || rootWidth <= 0) {
    return null;
  }

  return Math.max(
    SIDEBAR_PEEK_HIT_AREA_PX,
    Math.round((rootWidth * size) / 100),
  );
}

export function SidebarPeekShell({
  side,
  collapsed,
  widthPx,
  children,
}: SidebarPeekShellProps) {
  const {
    handleFocusLeave,
    handlePointerLeave,
    isVisible,
    panelRef,
    rootRef,
    showPeek,
    triggerRef,
  } = useSidebarPeekVisibility();

  if (!collapsed) {
    return <div className="h-full w-full min-w-0">{children}</div>;
  }

  const isLeft = side === "left";
  const edgeClassName = isLeft ? "left-0" : "right-0";
  const peekInsetStyle = {
    top: SIDEBAR_PEEK_INSET_TOP_PX,
    bottom: SIDEBAR_PEEK_INSET_BOTTOM_PX,
  };

  return (
    <div
      ref={rootRef}
      className="contents"
      onFocusCapture={showPeek}
      onBlurCapture={handleFocusLeave}
    >
      <div
        ref={triggerRef}
        aria-hidden="true"
        className={cn(
          // Center-band shell: peek from the center-stage edge, not header/footer.
          "peer fixed z-[70] bg-transparent",
          edgeClassName,
        )}
        style={{ width: SIDEBAR_PEEK_HIT_AREA_PX, ...peekInsetStyle }}
        onPointerEnter={showPeek}
        onPointerLeave={(event) => handlePointerLeave(event.relatedTarget)}
      />
      <div
        ref={panelRef}
        // Collapsed sidebar peek sits above center stage. Mark for webview
        // pointer-events policy so guest webviews do not steal clicks while open.
        data-atmos-browser-surface-overlay="true"
        className={cn(
          "fixed z-[45] min-w-0 overflow-hidden bg-sidebar text-sidebar-foreground shadow-2xl ring-1 ring-sidebar-border/80",
          "transition-[translate,opacity,box-shadow] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[translate,opacity]",
          isVisible
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none opacity-0 peer-hover:pointer-events-auto peer-hover:opacity-100 hover:pointer-events-auto hover:opacity-100",
          edgeClassName,
          isLeft
            ? "rounded-r-xl border-r border-sidebar-border"
            : "rounded-l-xl border-l border-sidebar-border",
          !isVisible &&
            (isLeft
              ? "-translate-x-full peer-hover:translate-x-0 hover:translate-x-0"
              : "translate-x-full peer-hover:translate-x-0 hover:translate-x-0"),
        )}
        style={{
          width:
            widthPx == null ? "min(360px, calc(100vw - 48px))" : `${widthPx}px`,
          ...peekInsetStyle,
        }}
        onPointerEnter={showPeek}
        onPointerLeave={(event) => handlePointerLeave(event.relatedTarget)}
      >
        <div className={cn("flex h-full min-h-0 flex-col", SIDEBAR_PEEK_CONTENT_PT_CLASS)}>
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
