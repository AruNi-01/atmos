"use client";

import React, { useState } from "react";
import {
  ArrowNarrowDownDashedIcon,
  ArrowNarrowUpDashedIcon,
  CircleHelp,
  SimpleCheckedIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { ChevronDown } from "lucide-react";

import type { TunnelConnectorStatus } from "@/features/connection/hooks/use-tunnel-connector";
import {
  CopyableLabel,
  CopyableText,
  RenewSessionPopover,
  formatExpiry,
  formatProvider,
  getSessionUrgency,
} from "@/features/tunnel-connector/components/TunnelConnectorSection";

export { getSessionUrgency };

type BranchSyncDirection = "ahead" | "behind" | "equal" | "unknown" | "diverged";

interface BranchSyncIndicatorState {
  direction: BranchSyncDirection;
  tooltip: string;
}

function BranchSyncIndicatorIcon({ direction }: { direction: BranchSyncDirection }) {
  if (direction === "diverged") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center gap-[1px]">
        <ArrowNarrowUpDashedIcon size={12} strokeWidth={2.1} className="text-success" />
        <ArrowNarrowDownDashedIcon size={12} strokeWidth={2.1} className="text-destructive" />
      </span>
    );
  }

  if (direction === "ahead" || direction === "behind") {
    const isAhead = direction === "ahead";
    const colorClass = isAhead ? "text-success" : "text-destructive";

    return (
      <span className={cn("flex size-4 items-center justify-center", colorClass)}>
        {isAhead ? (
          <ArrowNarrowUpDashedIcon size={14} strokeWidth={2.25} />
        ) : (
          <ArrowNarrowDownDashedIcon size={14} strokeWidth={2.25} />
        )}
      </span>
    );
  }

  if (direction === "unknown") {
    return (
      <span className="flex size-4 items-center justify-center text-muted-foreground">
        <CircleHelp size={13} strokeWidth={2.1} />
      </span>
    );
  }

  return (
    <span className="flex size-4 items-center justify-center text-muted-foreground">
      <SimpleCheckedIcon size={14} strokeWidth={2.25} />
    </span>
  );
}

export function BranchSyncIndicator({ state }: { state: BranchSyncIndicatorState }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          aria-label={state.tooltip}
          className="flex size-4 shrink-0 items-center justify-center"
        >
          <BranchSyncIndicatorIcon direction={state.direction} />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span>{state.tooltip}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function getBranchSyncIndicatorState(params: {
  defaultBranch: string | null;
  ahead: number | null;
  behind: number | null;
}): BranchSyncIndicatorState {
  const defaultBranchLabel = params.defaultBranch ?? "default branch";
  const aheadCount = params.ahead;
  const behindCount = params.behind;

  if (aheadCount === null || behindCount === null) {
    return {
      direction: "unknown",
      tooltip: `Unable to compare the remote branch with origin/${defaultBranchLabel}`,
    };
  }

  if (aheadCount > 0 && behindCount > 0) {
    return {
      direction: "diverged",
      tooltip: `Remote branch diverged from origin/${defaultBranchLabel}: ahead ${aheadCount}, behind ${behindCount}`,
    };
  }

  if (aheadCount > 0) {
    return {
      direction: "ahead",
      tooltip: `Remote branch is ahead of origin/${defaultBranchLabel} by ${aheadCount} commit${aheadCount === 1 ? "" : "s"}`,
    };
  }

  if (behindCount > 0) {
    return {
      direction: "behind",
      tooltip: `Remote branch is behind origin/${defaultBranchLabel} by ${behindCount} commit${behindCount === 1 ? "" : "s"}`,
    };
  }

  return {
    direction: "equal",
    tooltip: `Remote branch is in sync with origin/${defaultBranchLabel}`,
  };
}

export function TunnelItem({
  status,
  onRenew,
}: {
  status: TunnelConnectorStatus;
  onRenew: (ttlSecs: number, reuseToken: boolean) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const urgency = getSessionUrgency(status.expires_at);

  const expiryCollapsedCls =
    urgency === "expired"
      ? "text-red-500 font-medium"
      : urgency === "warning"
        ? "text-amber-500 font-medium"
        : "text-muted-foreground";

  const expiryExpandedCls =
    urgency === "expired"
      ? "text-red-500 font-medium"
      : urgency === "warning"
        ? "text-amber-500 font-medium"
        : "text-foreground";

  return (
    <div className={cn(
      "rounded-md border",
      urgency === "expired" ? "border-red-500/40" : urgency === "warning" ? "border-amber-500/40" : "border-border",
    )}>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            !expanded && "-rotate-90",
          )}
        />
        <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
        <span className="truncate text-sm font-medium text-popover-foreground">
          {status.provider ? formatProvider(status.provider) : "Tunnel"}
        </span>
        {!expanded && (
          <span className={cn("ml-auto shrink-0 text-[11px]", expiryCollapsedCls)}>
            {urgency === "expired" ? "Session expired" : `Expires ${formatExpiry(status.expires_at)}`}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-4">
          {status.public_url && (
            <div className="border-b border-border py-2.5 last:border-b-0">
              <CopyableLabel href={status.public_url}>Public URL</CopyableLabel>
              <CopyableText value={status.public_url} />
            </div>
          )}
          {status.share_url && (
            <div className="border-b border-border py-2.5 last:border-b-0">
              <CopyableLabel href={status.share_url}>Access URL (with token)</CopyableLabel>
              <CopyableText value={status.share_url} />
            </div>
          )}
          {status.entry_token && (
            <div className="border-b border-border py-2.5 last:border-b-0">
              <CopyableLabel>Entry Token</CopyableLabel>
              <CopyableText value={status.entry_token} />
            </div>
          )}
          <div className="flex items-center justify-between py-2.5 last:border-b-0">
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">Expires</p>
              <p className={cn("text-[11px]", expiryExpandedCls)}>{formatExpiry(status.expires_at)}</p>
            </div>
            {(urgency === "warning" || urgency === "expired") && status.provider && (
              <RenewSessionPopover
                provider={status.provider}
                status={status}
                onRenew={onRenew}
                urgency={urgency}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
