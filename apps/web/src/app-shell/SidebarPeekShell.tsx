"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/shared/lib/utils";

const SIDEBAR_PEEK_HIT_AREA_PX = 5;
const SIDEBAR_PEEK_CLOSE_DELAY_MS = 160;

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
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const showPeek = useCallback(() => {
    clearCloseTimer();
    setIsVisible(true);
  }, [clearCloseTimer]);

  const scheduleHide = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      if (
        triggerRef.current?.matches(":hover") ||
        panelRef.current?.matches(":hover") ||
        document.querySelector(SIDEBAR_PEEK_KEEP_OPEN_SELECTOR)
      ) {
        closeTimerRef.current = null;
        return;
      }

      setIsVisible(false);
      closeTimerRef.current = null;
    }, SIDEBAR_PEEK_CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const handlePointerLeave = useCallback(
    (relatedTarget: EventTarget | null) => {
      if (isSidebarPeekKeepOpenTarget(relatedTarget)) {
        clearCloseTimer();
        return;
      }
      scheduleHide();
    },
    [clearCloseTimer, scheduleHide],
  );

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const handlePointerOver = (event: PointerEvent) => {
      const target = event.target;
      if (
        isNodeInsideRef(target, triggerRef) ||
        isNodeInsideRef(target, panelRef) ||
        isSidebarPeekKeepOpenTarget(target)
      ) {
        clearCloseTimer();
        return;
      }
      scheduleHide();
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
    };
  }, [clearCloseTimer, isVisible, scheduleHide]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  if (!collapsed) {
    return <div className="h-full w-full min-w-0">{children}</div>;
  }

  const isLeft = side === "left";
  const edgeClassName = isLeft ? "left-0" : "right-0";

  return (
    <>
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
        onFocusCapture={showPeek}
        onPointerEnter={showPeek}
        onPointerLeave={(event) => handlePointerLeave(event.relatedTarget)}
      >
        {children}
      </div>
    </>
  );
}

const SIDEBAR_PEEK_KEEP_OPEN_SELECTOR = [
  "[data-workspace-popover-surface='true']:hover",
  "[data-radix-popper-content-wrapper]:hover",
  "[data-slot='popover-content']:hover",
  "[data-slot='hover-card-content']:hover",
  "[data-slot='tooltip-content']:hover",
  "[data-slot='dropdown-menu-content']:hover",
  "[data-slot='dropdown-menu-sub-content']:hover",
].join(", ");

const SIDEBAR_PEEK_KEEP_OPEN_TARGET_SELECTOR = [
  "[data-workspace-popover-surface='true']",
  "[data-radix-popper-content-wrapper]",
  "[data-slot='popover-content']",
  "[data-slot='hover-card-content']",
  "[data-slot='tooltip-content']",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='dropdown-menu-sub-content']",
].join(", ");

function isNodeInsideRef(
  target: EventTarget | null,
  ref: React.RefObject<HTMLElement | null>,
) {
  return target instanceof Node && ref.current?.contains(target);
}

function isSidebarPeekKeepOpenTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest(SIDEBAR_PEEK_KEEP_OPEN_TARGET_SELECTOR))
  );
}
