"use client";

import { cn, EmptyState, type EmptyStateProps } from "@workspace/ui";

/** Launchpad / full-pane empty matching Observer (ProjectEmpty Minimal). */
export function PageEmptyState({
  className,
  backdrop = "stack",
  ...props
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[360px] w-full items-center justify-center p-8">
      <EmptyState
        className={cn("max-w-[440px]", className)}
        backdrop={backdrop}
        {...props}
      />
    </div>
  );
}
