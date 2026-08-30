"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { Gauge, Coins } from "lucide-react";
import type { AgentSessionUsage, AgentTurnUsage } from "@atmos/api-types/ws/dto/agent-chat";

export function SessionUsageBadge({ usage, className }: { usage: AgentSessionUsage; className?: string }) {
  const t = useTranslations("Agent.components");
  const locale = useLocale();
  const hasContextWindow = usage.used != null && usage.size != null && usage.size > 0;
  const hasCost = usage.cost?.amount != null;
  const used = hasContextWindow ? usage.used : null;
  const size = hasContextWindow ? usage.size : null;
  const percent =
    hasContextWindow && used != null && size != null
      ? Math.min(100, (used / size) * 100)
      : null;

  if (!hasContextWindow && !hasCost) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "group absolute left-3 bottom-1 z-10 inline-flex h-8 max-w-8 items-center justify-start gap-0 overflow-hidden rounded-full border border-dashed border-border/70 bg-transparent px-2 text-[11px] font-medium text-foreground shadow-md transition-[max-width,gap] duration-300 ease-out origin-[left_center] hover:max-w-[200px] hover:gap-1.5 hover:border-solid hover:border-border cursor-help",
              className,
            )}
          >
            <span className="inline-flex size-4 shrink-0 items-center justify-center">
              {hasContextWindow ? (
                <Gauge className="size-3.5 text-primary/80" />
              ) : (
                <Coins className="size-3.5 text-primary/80" />
              )}
            </span>
            <span className="max-w-0 flex whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-300 ease-out group-hover:max-w-[150px] group-hover:opacity-100 items-center overflow-hidden">
              {hasContextWindow && percent != null ? (
                <>{percent.toFixed(0)}%</>
              ) : null}
              {hasCost ? (
                <span
                  className={cn(
                    hasContextWindow && "ml-1.5 border-l border-border pl-1.5",
                  )}
                >
                  ${(usage.cost?.amount ?? 0).toFixed(2)}
                </span>
              ) : null}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="p-3 w-52 z-100">
          <div className="space-y-2">
            {hasContextWindow && used != null && size != null && percent != null ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold">{t("usageBadges.session.contextWindow")}</span>
                  <span className="font-mono">{percent.toFixed(1)}%</span>
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] pt-0.5">
                    <span className="font-mono">{used.toLocaleString(locale)}</span>
                    <span className="font-mono">{size.toLocaleString(locale)}</span>
                  </div>
                </div>
              </div>
            ) : null}
            {hasCost ? (
              <div className="flex flex-col">
                {hasContextWindow ? <div className="mb-2 h-px w-full bg-background/20" /> : null}
                <span className="text-[10px]">{t("usageBadges.session.estimatedCost")}</span>
                <span className="text-xs font-mono font-semibold">
                  {(usage.cost?.amount ?? 0).toFixed(4)} {usage.cost?.currency ?? "USD"}
                </span>
              </div>
            ) : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
