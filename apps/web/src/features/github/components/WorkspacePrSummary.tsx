"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { ChecksStatusRing } from "@/features/github/components/ChecksStatusRing";
import {
  countChecksByTone,
  resolvePrStateChipClassName,
  type WorkspacePrLifecycleState,
  type WorkspacePrPresentation,
} from "@/features/github/lib/workspace-pr-status";

export type WorkspacePrSummaryProps = {
  presentation: WorkspacePrPresentation;
  /** Open in-app PR center tab. */
  onOpenPr?: () => void;
  /** Open in-app Action run center tab (or PR if no run is available). */
  onOpenChecks?: () => void;
  className?: string;
  /** Compact ring for dense popovers / cards. */
  ringSize?: number;
};

const STATE_LABEL_KEY: Record<
  WorkspacePrLifecycleState,
  "prState.open" | "prState.draft" | "prState.merged" | "prState.closed"
> = {
  open: "prState.open",
  draft: "prState.draft",
  merged: "prState.merged",
  closed: "prState.closed",
};

/**
 * Compact PR row: `#number title` + state chip + clickable checks ring.
 * Parent wires center-tab navigation for PR / Action pages.
 */
export function WorkspacePrSummary({
  presentation,
  onOpenPr,
  onOpenChecks,
  className,
  ringSize = 16,
}: WorkspacePrSummaryProps) {
  const t = useTranslations("AppShell.chrome.workspaceContent");
  const prLabel = t("openPullRequest", {
    number: presentation.number,
    title: presentation.title,
  });
  const fullTitle = presentation.title;
  const stateLabel = t(STATE_LABEL_KEY[presentation.state]);
  const hasChecks = presentation.checks.length > 0;

  const checksCounts = React.useMemo(
    () => countChecksByTone(presentation.checks),
    [presentation.checks],
  );

  const checksTooltip = React.useMemo(() => {
    if (!hasChecks) return t("checksSummary.none");

    const parts: string[] = [];
    if (checksCounts.success > 0) {
      parts.push(t("checksSummary.passed", { count: checksCounts.success }));
    }
    if (checksCounts.running > 0) {
      parts.push(t("checksSummary.inProgress", { count: checksCounts.running }));
    }
    if (checksCounts.failure > 0) {
      parts.push(t("checksSummary.failed", { count: checksCounts.failure }));
    }
    if (checksCounts.neutral > 0) {
      parts.push(t("checksSummary.skipped", { count: checksCounts.neutral }));
    }
    return parts.length > 0 ? parts.join(t("checksSummary.separator")) : t("checksSummary.none");
  }, [checksCounts, hasChecks, t]);

  return (
    <TooltipProvider delayDuration={250}>
      <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onOpenPr?.();
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted/70"
              aria-label={prLabel}
            >
              <span className="shrink-0 font-semibold text-foreground">
                #{presentation.number}
              </span>
              <span className="min-w-0 truncate text-muted-foreground">
                {presentation.title}
              </span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium capitalize",
                  resolvePrStateChipClassName(presentation.state),
                )}
              >
                {stateLabel}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm text-xs break-words">
            {fullTitle}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                if (onOpenChecks) {
                  onOpenChecks();
                  return;
                }
                onOpenPr?.();
              }}
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-md p-0.5 transition-colors",
                "hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                !hasChecks && "opacity-70",
              )}
              aria-label={checksTooltip}
            >
              <ChecksStatusRing
                checks={presentation.checks}
                size={ringSize}
                strokeWidth={2.25}
                className="pointer-events-none"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {checksTooltip}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
