"use client";

import React from "react";

import { cn } from "@/shared/lib/utils";
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
          "peer fixed top-12 bottom-6 z-[70] bg-transparent",
          edgeClassName,
        )}
        style={{ width: SIDEBAR_PEEK_HIT_AREA_PX }}
        onPointerEnter={showPeek}
        onPointerLeave={(event) => handlePointerLeave(event.relatedTarget)}
      />
      <div
        ref={panelRef}
        // Collapsed sidebar peek sits above center stage in DOM, but desktop-native
        // child webviews ignore CSS z-index. Opt into APP-029 occlusion so center
        // previews hide while this panel is visible (opacity > 0).
        data-atmos-native-surface-overlay="true"
        className={cn(
          "fixed top-12 bottom-6 z-[45] min-w-0 overflow-visible bg-background text-foreground shadow-2xl ring-1 ring-sidebar-border/80",
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
        }}
        onPointerEnter={showPeek}
        onPointerLeave={(event) => handlePointerLeave(event.relatedTarget)}
      >
        {children}
      </div>
    </div>
  );
}
