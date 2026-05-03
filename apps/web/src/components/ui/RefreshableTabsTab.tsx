"use client";

import React, { useCallback, useMemo, useState } from "react";
import { LoaderCircle, RotateCw } from "lucide-react";
import { TabsTab } from "@workspace/ui";
import { cn } from "@/lib/utils";

interface RefreshableTabsTabProps {
  value: string;
  activeValue: string;
  refreshTitle: string;
  onRefresh: () => Promise<unknown> | void;
  isRefreshing?: boolean;
  className?: string;
  trailingAction?: (options: { isVisible: boolean }) => React.ReactNode;
  children: React.ReactNode;
}

export function RefreshableTabsTab({
  value,
  activeValue,
  refreshTitle,
  onRefresh,
  isRefreshing = false,
  className,
  trailingAction,
  children,
}: RefreshableTabsTabProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isRefreshPending, setIsRefreshPending] = useState(false);

  const isActive = value === activeValue;
  const showRefreshButton =
    isActive && (isHovered || isRefreshPending || isRefreshing);
  const isSpinning = isRefreshPending || isRefreshing;

  const handleRefresh = useCallback(
    (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
      if (!showRefreshButton || isRefreshPending) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      setIsRefreshPending(true);
      Promise.resolve(onRefresh()).finally(() => {
        setIsRefreshPending(false);
      });
    },
    [isRefreshPending, onRefresh, showRefreshButton],
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
          "absolute inset-0 flex items-center justify-center gap-0 overflow-hidden transition-all duration-200 ease-out",
          showRefreshButton
            ? "translate-y-0 opacity-100"
            : "translate-y-7 opacity-0 pointer-events-none",
        )}
      >
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
          className="flex h-full flex-1 items-center justify-center gap-1.5 cursor-pointer hover:bg-sidebar-accent"
        >
          <LoaderCircle className={cn("size-3.5", isSpinning && "animate-spin")} />
          <span className="text-xs font-medium">Refresh</span>
        </span>
        {trailingAction?.({ isVisible: showRefreshButton })}
      </div>
    </TabsTab>
  );
}
