"use client";

import React from "react";
import { cn } from "@workspace/ui";
import { Button } from "@workspace/ui/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useSidebarPeekVisibility } from "@/app-shell/use-sidebar-peek-visibility";

export function AgentChatHistorySidebarToggle({
  collapsed,
  className,
  expandLabel,
  hideLabel,
  iconClassName,
  onToggle,
}: {
  collapsed: boolean;
  className?: string;
  expandLabel: string;
  hideLabel: string;
  iconClassName?: string;
  onToggle: () => void;
}) {
  const label = collapsed ? expandLabel : hideLabel;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className={className ?? "size-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"}
      aria-label={label}
      title={label}
    >
      {collapsed ? (
        <PanelLeftOpen className={iconClassName ?? "size-[18px]"} />
      ) : (
        <PanelLeftClose className={iconClassName ?? "size-[18px]"} />
      )}
    </Button>
  );
}

export function AgentChatHistorySidebarFrame({
  frameRef,
  collapsed,
  expandLabel,
  showCollapsedExpandButton = true,
  width,
  isResizing,
  onResizeStart,
  onCollapsedExpand,
  children,
}: {
  frameRef: React.RefObject<HTMLDivElement | null>;
  collapsed: boolean;
  expandLabel: string;
  showCollapsedExpandButton?: boolean;
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
          <AgentChatHistoryPeekShell
            expandLabel={expandLabel}
            showExpandButton={showCollapsedExpandButton}
            width={width}
            onExpand={onCollapsedExpand}
          >
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
  expandLabel,
  showExpandButton,
  width,
  onExpand,
  children,
}: {
  expandLabel: string;
  showExpandButton: boolean;
  width: number;
  onExpand: () => void;
  children: React.ReactNode;
}) {
  const {
    handleFocusLeave,
    handlePointerLeave,
    isVisible,
    panelRef,
    rootRef,
    showPeek,
    triggerRef,
  } = useSidebarPeekVisibility();

  return (
    <div
      ref={rootRef}
      className="contents"
      onFocusCapture={showPeek}
      onBlurCapture={handleFocusLeave}
    >
      {showExpandButton ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute left-2 top-2 z-50 size-8 rounded-md bg-background/75 text-muted-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-md hover:bg-muted hover:text-foreground"
          aria-label={expandLabel}
          title={expandLabel}
          onClick={onExpand}
        >
          <PanelLeftOpen className="size-4" />
        </Button>
      ) : null}
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
        onPointerEnter={showPeek}
        onPointerLeave={(event) => handlePointerLeave(event.relatedTarget)}
        onMouseEnter={showPeek}
        onMouseLeave={(event) => handlePointerLeave(event.relatedTarget)}
      >
        {children}
      </div>
    </div>
  );
}
