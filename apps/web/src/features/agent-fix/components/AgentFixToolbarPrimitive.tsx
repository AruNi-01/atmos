"use client";

import React from "react";
import { Copy, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui";

type AgentFixToolbarPrimitiveVariant = "bottom" | "inline" | "review";
type AgentFixToolbarPrimitiveSize = "sm" | "xs";

type AgentFixToolbarPrimitiveAction = {
  ariaLabel?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  icon: React.ReactNode;
  isLoading?: boolean;
  label: React.ReactNode;
  onClick: () => void | Promise<void>;
  title?: string;
};

export function AgentFixToolbarPrimitive({
  className,
  copyAction,
  primaryAction,
  renderSettings,
  size = "sm",
  title,
  variant = "inline",
}: {
  className?: string;
  copyAction?: Omit<AgentFixToolbarPrimitiveAction, "icon"> & {
    icon?: React.ReactNode;
  };
  primaryAction: AgentFixToolbarPrimitiveAction;
  renderSettings: (className: string) => React.ReactNode;
  size?: AgentFixToolbarPrimitiveSize;
  title?: string;
  variant?: AgentFixToolbarPrimitiveVariant;
}) {
  const isBottom = variant === "bottom";
  const isReview = variant === "review";
  const controlHeightClass = isReview ? "h-full" : size === "xs" ? "h-6" : "h-8";
  const settingsSizeClass = isReview ? "h-full w-8" : size === "xs" ? "size-6" : "size-8";
  const iconSizeClass = size === "xs" ? "size-3" : "size-3.5";
  const textSizeClass = isReview ? "text-[13px]" : size === "xs" ? "text-[11px]" : "text-xs";
  const segmentPaddingClass = isReview ? "px-2.5" : size === "xs" ? "px-2" : "px-2.5";
  const segmentClass = isReview
    ? "text-foreground hover:bg-sidebar-accent/30 transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)]"
    : isBottom
      ? "text-foreground/90 transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background hover:text-foreground"
      : "text-secondary-foreground transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-secondary/80 hover:text-secondary-foreground";
  const settingsClassName = cn(
    "shrink-0 rounded-none border-0 border-r border-border/50 bg-transparent shadow-none",
    settingsSizeClass,
    segmentClass,
  );
  const buttonBaseClass = cn(
    "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-none border-0 font-medium shadow-none",
    controlHeightClass,
    textSizeClass,
    segmentClass,
    "disabled:cursor-not-allowed disabled:opacity-50",
  );
  const copyButtonClass = cn(
    buttonBaseClass,
    "border-r border-border/50",
    copyAction?.hideLabel && isReview ? "w-8 shrink-0 px-0" : segmentPaddingClass,
  );
  const primaryButtonClass = cn(
    buttonBaseClass,
    segmentPaddingClass,
    isReview ? "min-w-8 flex-1 basis-0" : "flex-1",
  );

  return (
    <div
      className={cn(
        "flex min-w-0 items-stretch overflow-hidden",
        isReview
          ? "h-full flex-1 rounded-none border-0 bg-transparent"
          : cn(
              "rounded-md border shadow-none",
              isBottom ? "w-full border-border/60 bg-muted/30" : "border-transparent bg-secondary",
            ),
        className,
      )}
      title={title}
    >
      {renderSettings(settingsClassName)}
      {copyAction ? (
        <button
          type="button"
          disabled={copyAction.disabled}
          onClick={() => void copyAction.onClick()}
          className={copyButtonClass}
          aria-label={copyAction.ariaLabel}
          title={copyAction.title}
        >
          {copyAction.isLoading ? (
            <Loader2 className={cn(iconSizeClass, "animate-spin shrink-0")} />
          ) : (
            copyAction.icon ?? <Copy className={cn(iconSizeClass, "shrink-0")} />
          )}
          {copyAction.hideLabel ? null : <span className="truncate">{copyAction.label}</span>}
        </button>
      ) : null}
      <button
        type="button"
        disabled={primaryAction.disabled}
        onClick={() => void primaryAction.onClick()}
        className={primaryButtonClass}
        aria-label={primaryAction.ariaLabel}
        title={primaryAction.title}
      >
        {primaryAction.isLoading ? (
          <Loader2 className={cn(iconSizeClass, "animate-spin shrink-0")} />
        ) : (
          <span className="shrink-0">{primaryAction.icon}</span>
        )}
        <span className="min-w-0 truncate">{primaryAction.label}</span>
      </button>
    </div>
  );
}
