"use client";

import React, { useCallback, useMemo, useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { TabsTab } from "@workspace/ui";
import { cn } from "@/shared/lib/utils";

interface RefreshableTabsTabProps {
  value: string;
  activeValue: string;
  refreshTitle: string;
  /**
   * User-clicked Refresh handler. Callers must force a network re-request
   * (see FORCE_REFETCH_OPTIONS). Navigating into the tab may still use cache.
   */
  onRefresh: () => Promise<unknown> | void;
  isRefreshing?: boolean;
  forceActionsVisible?: boolean;
  className?: string;
  trailingAction?: (options: { isVisible: boolean }) => React.ReactNode;
  /** Show the hover refresh control even when this tab is not selected. */
  refreshWhenInactive?: boolean;
  children: React.ReactNode;
}

export function RefreshableTabsTab({
  value,
  activeValue,
  refreshTitle,
  onRefresh,
  isRefreshing = false,
  forceActionsVisible = false,
  className,
  trailingAction,
  refreshWhenInactive = false,
  children,
}: RefreshableTabsTabProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isRefreshPending, setIsRefreshPending] = useState(false);

  const isActive = value === activeValue;
  const showRefreshButton =
    (isActive || refreshWhenInactive) &&
    (isHovered || isRefreshPending || isRefreshing || forceActionsVisible);
  const isSpinning = isRefreshPending || isRefreshing;

  const handleRefresh = useCallback(
    (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
      if (!showRefreshButton || isRefreshPending || isRefreshing) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      setIsRefreshPending(true);
      // Prefer awaiting the caller's thenable so hover Refresh keeps spinning
      // until the Query refetch finishes (not just until a voided call returns).
      Promise.resolve(onRefresh()).finally(() => {
        setIsRefreshPending(false);
      });
    },
    [isRefreshPending, isRefreshing, onRefresh, showRefreshButton],
  );

  const refreshLabel = useMemo(
    () => (isSpinning ? `${refreshTitle} (refreshing)` : refreshTitle),
    [isSpinning, refreshTitle],
  );

  return (
    <TabsTab
      value={value}
      className={cn("relative overflow-hidden", className)}
      title={showRefreshButton ? refreshLabel : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "flex items-center justify-center gap-1.5 transition-all duration-200 ease-out",
          showRefreshButton && "-translate-y-7 opacity-0",
        )}
      >
        {children}
      </div>

      <div
        className={cn(
          "absolute inset-0 flex items-center gap-0 overflow-hidden transition-all duration-200 ease-out",
          !trailingAction && "justify-center",
          showRefreshButton
            ? "translate-y-0 opacity-100"
            : "translate-y-7 opacity-0 pointer-events-none",
        )}
      >
        {trailingAction?.({ isVisible: showRefreshButton })}
        <span
          role="button"
          aria-label={refreshLabel}
          tabIndex={showRefreshButton ? 0 : -1}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={handleRefresh}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            handleRefresh(event);
          }}
          className={cn(
            "flex h-full cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
            // Files tab (and any tab with extra hover actions): compact icon at the end.
            // Commits / PR tabs: keep the original full-width centered refresh hit target.
            trailingAction
              ? "w-8 shrink-0 border-l border-sidebar-border/60"
              : "flex-1",
          )}
        >
          {isSpinning ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RotateCcw className="size-3.5" />
          )}
        </span>
      </div>
    </TabsTab>
  );
}
