"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@workspace/ui";
import { Button } from "@workspace/ui/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function AgentChatHistorySidebarToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className="size-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={collapsed ? "Expand history sidebar" : "Hide history sidebar"}
      title={collapsed ? "Expand history sidebar" : "Hide history sidebar"}
    >
      {collapsed ? (
        <PanelLeftOpen className="size-[18px]" />
      ) : (
        <PanelLeftClose className="size-[18px]" />
      )}
    </Button>
  );
}

export function AgentChatHistorySidebarFrame({
  frameRef,
  collapsed,
  width,
  isResizing,
  onResizeStart,
  onCollapsedExpand,
  children,
}: {
  frameRef: React.RefObject<HTMLDivElement | null>;
  collapsed: boolean;
  width: number;
  isResizing: boolean;
  onResizeStart: (event: React.MouseEvent) => void;
  onCollapsedExpand: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        ref={frameRef}
        className={cn(
          "relative h-full min-h-0 shrink-0",
          !isResizing && "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "overflow-visible" : "overflow-hidden",
        )}
        style={{
          width: collapsed ? 0 : width,
          willChange: isResizing ? "width" : undefined,
        }}
      >
        {collapsed ? (
          <AgentChatHistoryPeekShell width={width} onExpand={onCollapsedExpand}>
            {children}
          </AgentChatHistoryPeekShell>
        ) : (
          <div className="h-full min-h-0 overflow-hidden">
            {children}
          </div>
        )}
      </div>
      {!collapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          className={cn(
            "group relative flex h-full w-px shrink-0 cursor-col-resize items-center justify-center bg-transparent touch-none",
            "before:absolute before:inset-y-0 before:left-1/2 before:w-2 before:-translate-x-1/2",
          )}
          onMouseDown={onResizeStart}
        >
          <div className="pointer-events-none h-full w-px bg-border/80 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
        </div>
      ) : null}
    </>
  );
}

function AgentChatHistoryPeekShell({
  width,
  onExpand,
  children,
}: {
  width: number;
  onExpand: () => void;
  children: React.ReactNode;
}) {
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
        document.querySelector(AGENT_CHAT_HISTORY_PEEK_KEEP_OPEN_SELECTOR)
      ) {
        closeTimerRef.current = null;
        return;
      }

      setIsVisible(false);
      closeTimerRef.current = null;
    }, 160);
  }, [clearCloseTimer]);

  const handlePointerLeave = useCallback(
    (relatedTarget: EventTarget | null) => {
      if (isAgentChatHistoryPeekKeepOpenTarget(relatedTarget)) {
        clearCloseTimer();
        return;
      }
      scheduleHide();
    },
    [clearCloseTimer, scheduleHide],
  );

  useEffect(() => {
    if (!isVisible) return;

    const handlePointerOver = (event: PointerEvent) => {
      const target = event.target;
      if (
        isNodeInsideRef(target, triggerRef) ||
        isNodeInsideRef(target, panelRef) ||
        isAgentChatHistoryPeekKeepOpenTarget(target)
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

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute left-2 top-2 z-50 size-8 rounded-md bg-background/75 text-muted-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-md hover:bg-muted hover:text-foreground"
        aria-label="Expand history sidebar"
        title="Expand history sidebar"
        onClick={onExpand}
        onFocus={showPeek}
      >
        <PanelLeftOpen className="size-4" />
      </Button>
      <div
        ref={triggerRef}
        aria-hidden="true"
        className="peer absolute inset-y-0 left-0 z-50 bg-transparent"
        style={{ width: 5 }}
        onPointerEnter={showPeek}
        onPointerLeave={(event) => handlePointerLeave(event.relatedTarget)}
        onMouseEnter={showPeek}
        onMouseLeave={(event) => handlePointerLeave(event.relatedTarget)}
      />
      <div
        ref={panelRef}
        className={cn(
          "absolute inset-y-0 left-0 z-40 min-w-0 overflow-hidden bg-muted/20 text-foreground shadow-2xl ring-1 ring-border/80 backdrop-blur-md",
          "transition-[translate,opacity,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[translate,opacity]",
          isVisible
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-full opacity-0 peer-hover:pointer-events-auto peer-hover:translate-x-0 peer-hover:opacity-100 hover:pointer-events-auto hover:translate-x-0 hover:opacity-100",
          "rounded-r-xl",
        )}
        style={{ width }}
        onFocusCapture={showPeek}
        onPointerEnter={showPeek}
        onPointerLeave={(event) => handlePointerLeave(event.relatedTarget)}
        onMouseEnter={showPeek}
        onMouseLeave={(event) => handlePointerLeave(event.relatedTarget)}
      >
        {children}
      </div>
    </>
  );
}

const AGENT_CHAT_HISTORY_PEEK_KEEP_OPEN_SELECTOR = [
  "[data-radix-popper-content-wrapper]:hover",
  "[data-slot='popover-content']:hover",
  "[data-slot='hover-card-content']:hover",
  "[data-slot='tooltip-content']:hover",
  "[data-slot='dropdown-menu-content']:hover",
  "[data-slot='dropdown-menu-sub-content']:hover",
].join(", ");

const AGENT_CHAT_HISTORY_PEEK_KEEP_OPEN_TARGET_SELECTOR = [
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

function isAgentChatHistoryPeekKeepOpenTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest(AGENT_CHAT_HISTORY_PEEK_KEEP_OPEN_TARGET_SELECTOR))
  );
}
