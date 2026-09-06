"use client";

import React, { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { Coins, X } from "lucide-react";
import type { AgentSessionUsage, AgentTurnUsage } from "@atmos/api-types/ws/dto/agent-chat";
import type { QuotaProviderResponse } from "@/api/ws-api";
import { useQuotaOverviewQuery } from "@/features/quota-usage/hooks/use-quota-overview-query";
import { quotaProviderIdsForChatAgent } from "@/features/quota-usage/lib/agent-quota-provider-map";
import { canonicalizeChatProviderId } from "@/features/agent/lib/custom-agent-registry";
import {
  contextWindowBarTone,
  contextWindowStats,
  formatCompactTokenCount,
  type ContextWindowBarTone,
} from "@/features/agent/lib/context-window-usage";
import {
  presentQuotaMetric,
  providerIdentity,
  quotaMetrics,
} from "@/app-shell/quota-popover-utils";

function CircularProgress({
  percent,
  tone,
  className,
}: {
  percent: number;
  tone: ContextWindowBarTone;
  className?: string;
}) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-3.5 shrink-0", className)}
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-muted-foreground/35"
      />
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={tone === "warning" ? "text-warning" : "text-foreground"}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}

function ContextUsageBar({
  percent,
  tone,
}: {
  percent: number;
  tone: ContextWindowBarTone;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          tone === "warning" ? "bg-warning" : "bg-foreground",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function AgentQuotaSection({
  provider,
}: {
  provider: QuotaProviderResponse;
}) {
  const t = useTranslations("Agent.components.contextWindow");
  const locale = useLocale();
  const metrics = quotaMetrics(provider);
  if (metrics.length === 0) return null;

  const { planLabel } = providerIdentity(provider, t("notDetected"));
  const sectionTitle = planLabel
    ? t("quotaSectionWithPlan", { plan: planLabel })
    : t("quotaSection");

  return (
    <div className="space-y-2.5 border-t border-border/60 pt-3">
      <div className="text-xs text-muted-foreground">{sectionTitle}</div>
      <div className="space-y-2.5">
        {metrics.map((metric) => {
          const view = presentQuotaMetric(metric, {
            fallbackResetAt: provider.subscription_summary?.reset_at,
            locale,
          });
          return (
            <div key={metric.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium text-foreground">{view.label}</span>
                <div className="flex min-w-0 items-baseline gap-2 text-right">
                  {view.resetText ? (
                    <span className="truncate text-muted-foreground">{view.resetText}</span>
                  ) : null}
                  {view.valueText ? (
                    <span className="shrink-0 font-medium tabular-nums text-foreground">
                      {view.valueText}
                    </span>
                  ) : null}
                </div>
              </div>
              {view.percent != null ? (
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, view.percent))}%` }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useMatchedQuota(providerId: string | null | undefined, enabled: boolean) {
  const quotaIds = useMemo(
    () => quotaProviderIdsForChatAgent(providerId, canonicalizeChatProviderId),
    [providerId],
  );
  const quotaQuery = useQuotaOverviewQuery({
    enabled: enabled && quotaIds.length > 0,
  });

  return useMemo(() => {
    if (quotaIds.length === 0) return null;
    const providers = quotaQuery.data?.providers ?? [];
    return (
      providers.find(
        (provider) =>
          quotaIds.includes(provider.id)
          && provider.switch_enabled
          && provider.enabled,
      ) ?? null
    );
  }, [quotaIds, quotaQuery.data?.providers]);
}

function ContextUsageSummaryBody({
  percent,
  usedLabel,
  sizeLabel,
  tone,
  matchedQuota,
}: {
  percent: number;
  usedLabel: string;
  sizeLabel: string;
  tone: ContextWindowBarTone;
  matchedQuota: QuotaProviderResponse | null;
}) {
  const t = useTranslations("Agent.components.contextWindow");
  const percentLabel = `${Math.round(percent)}%`;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">{t("percentFull", { percent: percentLabel })}</span>
        <span className="tabular-nums">
          {t("tokensSummary", { used: usedLabel, size: sizeLabel })}
        </span>
      </div>
      <ContextUsageBar percent={percent} tone={tone} />
      {matchedQuota ? <AgentQuotaSection provider={matchedQuota} /> : null}
    </div>
  );
}

/**
 * Detached floating card above the prompt input (same overlay lane as Approve).
 * Not connected to the composer border / plan-queue stack chrome.
 */
export function ContextUsageDetailsPanel({
  usage,
  providerId,
  onClose,
  className,
}: {
  usage: AgentSessionUsage | null | undefined;
  providerId?: string | null;
  onClose: () => void;
  className?: string;
}) {
  const t = useTranslations("Agent.components.contextWindow");
  const stats = contextWindowStats(usage);
  const matchedQuota = useMatchedQuota(providerId, true);

  if (!stats) return null;

  const tone = contextWindowBarTone(stats.percent);
  const usedLabel = formatCompactTokenCount(stats.used);
  const sizeLabel = formatCompactTokenCount(stats.context_window);

  return (
    <div
      id="agent-context-usage-panel"
      role="region"
      aria-label={t("title")}
      data-agent-context-usage-panel=""
      className={cn(
        "w-full rounded-3xl border border-border bg-background p-3 shadow-none",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-foreground">{t("title")}</div>
        <button
          type="button"
          aria-label={t("closeAria")}
          onClick={onClose}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <ContextUsageSummaryBody
        percent={stats.percent}
        usedLabel={usedLabel}
        sizeLabel={sizeLabel}
        tone={tone}
        matchedQuota={matchedQuota}
      />
    </div>
  );
}

/**
 * Compact context-window control for the prompt footer.
 * Hidden when used/size are unknown.
 * Click toggles {@link ContextUsageDetailsPanel} as a floating card above the input (never a popover).
 */
export function ContextWindowUsageControl({
  usage,
  className,
  open: openProp,
  onOpenChange,
}: {
  usage: AgentSessionUsage | null | undefined;
  /** @deprecated Unused — quota details live on the stacked panel. */
  providerId?: string | null;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("Agent.components.contextWindow");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const stats = contextWindowStats(usage);
  const tone = stats ? contextWindowBarTone(stats.percent) : "default";

  if (!stats) return null;

  const percentLabel = `${Math.round(stats.percent)}%`;

  return (
    <button
      type="button"
      aria-label={t("toggleAria", { percent: percentLabel })}
      aria-expanded={open}
      aria-controls={open ? "agent-context-usage-panel" : undefined}
      onClick={() => setOpen(!open)}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium tabular-nums text-muted-foreground transition-colors",
        "bg-transparent hover:bg-muted/60 hover:text-foreground",
        open && "bg-muted/60 text-foreground",
        className,
      )}
    >
      <CircularProgress percent={stats.percent} tone={tone} />
      <span>{percentLabel}</span>
    </button>
  );
}

/** @deprecated Prefer ContextWindowUsageControl in the prompt footer. */
export function SessionUsageBadge({
  usage,
  className,
  providerId,
}: {
  usage: AgentSessionUsage;
  className?: string;
  providerId?: string | null;
}) {
  return (
    <ContextWindowUsageControl
      usage={usage}
      providerId={providerId}
      className={className}
    />
  );
}

export function MessageTurnUsageBadge({ usage }: { usage: AgentTurnUsage }) {
  const t = useTranslations("Agent.components");
  const locale = useLocale();
  const totalTokens = usage.total_tokens ?? ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));
  const total = totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens;

  if (usage.total_tokens == null && usage.input_tokens == null && usage.output_tokens == null) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex cursor-help items-center gap-1.5 rounded-full border border-dashed border-border/70 bg-transparent px-2 py-1 text-[10px] font-medium text-muted-foreground hover:border-border hover:bg-transparent hover:text-foreground">
            <Coins className="size-3" />
            <span>{total}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="p-3 w-52 z-100">
          <div className="space-y-1.5">
            <div className="mb-1 pb-1 text-xs font-semibold">
              {t("usageBadges.turn.title")}
            </div>
            <div className="h-px w-full bg-background/20" />
            <div className="flex justify-between text-[11px]">
              <span>{t("usageBadges.turn.input")}</span>
              <span className="font-mono">{(usage.input_tokens ?? 0).toLocaleString(locale)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>{t("usageBadges.turn.output")}</span>
              <span className="font-mono">{(usage.output_tokens ?? 0).toLocaleString(locale)}</span>
            </div>
            {usage.thought_tokens != null && (
              <div className="flex justify-between text-[11px]">
                <span>{t("usageBadges.turn.thought")}</span>
                <span className="font-mono">{(usage.thought_tokens ?? 0).toLocaleString(locale)}</span>
              </div>
            )}
            {(usage.cached_read_tokens != null || usage.cached_write_tokens != null) && (
              <div className="mt-1 space-y-1 pt-1">
                <div className="h-px w-full bg-background/20" />
                {usage.cached_read_tokens != null && (
                  <div className="flex justify-between text-[11px]">
                    <span>{t("usageBadges.turn.cacheRead")}</span>
                    <span className="font-mono">{(usage.cached_read_tokens ?? 0).toLocaleString(locale)}</span>
                  </div>
                )}
                {usage.cached_write_tokens != null && (
                  <div className="flex justify-between text-[11px]">
                    <span>{t("usageBadges.turn.cacheWrite")}</span>
                    <span className="font-mono">{(usage.cached_write_tokens ?? 0).toLocaleString(locale)}</span>
                  </div>
                )}
              </div>
            )}
            <div className="mt-1 pt-1 text-[11px] font-bold">
              <div className="mb-1 h-px w-full bg-background/20" />
              <div className="flex justify-between">
                <span>{t("usageBadges.turn.total")}</span>
                <span className="font-mono">{totalTokens.toLocaleString(locale)}</span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
