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
import { useTranslations } from "next-intl";

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

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function getBranchSyncIndicatorState(params: {
  defaultBranch: string | null;
  ahead: number | null;
  behind: number | null;
}, translate?: Translate): BranchSyncIndicatorState {
  const defaultBranchLabel = params.defaultBranch ?? (translate ? translate("headerParts.defaultBranch") : "default branch");
  const aheadCount = params.ahead;
  const behindCount = params.behind;
  const t = translate;
  const fallback = (key: string, vars?: Record<string, string | number>) => {
    switch (key) {
      case "headerParts.unableToCompare":
        return `Unable to compare the remote branch with origin/${vars?.branch ?? defaultBranchLabel}`;
      case "headerParts.diverged":
        return `Remote branch diverged from origin/${vars?.branch ?? defaultBranchLabel}: ahead ${vars?.ahead}, behind ${vars?.behind}`;
      case "headerParts.ahead": {
        const count = vars?.count ?? 0;
        const countText = `${count} commit${count === 1 ? "" : "s"}`;
        return `Remote branch is ahead of origin/${vars?.branch ?? defaultBranchLabel} by ${countText}`;
      }
      case "headerParts.behind": {
        const count = vars?.count ?? 0;
        const countText = `${count} commit${count === 1 ? "" : "s"}`;
        return `Remote branch is behind origin/${vars?.branch ?? defaultBranchLabel} by ${countText}`;
      }
      case "headerParts.inSync":
        return `Remote branch is in sync with origin/${vars?.branch ?? defaultBranchLabel}`;
      default:
        return "";
    }
  };

  if (aheadCount === null || behindCount === null) {
    return {
      direction: "unknown",
      tooltip: t ? t("headerParts.unableToCompare", { branch: defaultBranchLabel }) : fallback("headerParts.unableToCompare", { branch: defaultBranchLabel }),
    };
  }

  if (aheadCount > 0 && behindCount > 0) {
    return {
      direction: "diverged",
      tooltip: t ? t("headerParts.diverged", { branch: defaultBranchLabel, ahead: aheadCount, behind: behindCount }) : fallback("headerParts.diverged", { branch: defaultBranchLabel, ahead: aheadCount, behind: behindCount }),
    };
  }

  if (aheadCount > 0) {
    return {
      direction: "ahead",
      tooltip: t ? t("headerParts.ahead", { branch: defaultBranchLabel, count: aheadCount }) : fallback("headerParts.ahead", { branch: defaultBranchLabel, count: aheadCount }),
    };
  }

  if (behindCount > 0) {
    return {
      direction: "behind",
      tooltip: t ? t("headerParts.behind", { branch: defaultBranchLabel, count: behindCount }) : fallback("headerParts.behind", { branch: defaultBranchLabel, count: behindCount }),
    };
  }

  return {
    direction: "equal",
    tooltip: t ? t("headerParts.inSync", { branch: defaultBranchLabel }) : fallback("headerParts.inSync", { branch: defaultBranchLabel }),
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
  const t = useTranslations("appShell");
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
          {status.provider ? formatProvider(status.provider) : t("headerParts.tunnel")}
        </span>
        {!expanded && (
          <span className={cn("ml-auto shrink-0 text-[11px]", expiryCollapsedCls)}>
            {urgency === "expired"
              ? t("headerParts.sessionExpired")
              : t("headerParts.expires", { when: formatExpiry(status.expires_at) })
            }
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-4">
          {status.public_url && (
            <div className="border-b border-border py-2.5 last:border-b-0">
              <CopyableLabel href={status.public_url}>{t("headerParts.publicUrl")}</CopyableLabel>
              <CopyableText value={status.public_url} />
            </div>
          )}
          {status.share_url && (
            <div className="border-b border-border py-2.5 last:border-b-0">
              <CopyableLabel href={status.share_url}>{t("headerParts.accessUrl")}</CopyableLabel>
              <CopyableText value={status.share_url} />
            </div>
          )}
          {status.entry_token && (
            <div className="border-b border-border py-2.5 last:border-b-0">
              <CopyableLabel>{t("headerParts.entryToken")}</CopyableLabel>
              <CopyableText value={status.entry_token} />
            </div>
          )}
          <div className="flex items-center justify-between py-2.5 last:border-b-0">
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">{t("headerParts.expiresLabel")}</p>
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
