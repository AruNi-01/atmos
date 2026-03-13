"use client";

import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { Gauge, Coins } from "lucide-react";
import type { AgentUsage, AgentTurnUsage } from "@/hooks/use-agent-session";

export function SessionUsageBadge({ usage }: { usage: AgentUsage }) {
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
          <div className="group absolute left-3 bottom-1 z-10 inline-flex h-8 max-w-8 items-center justify-start gap-0 overflow-hidden rounded-sm border border-dashed border-border/70 bg-background px-2 text-[11px] font-medium text-foreground shadow-md transition-[max-width,gap] duration-300 ease-out origin-[left_center] hover:max-w-[200px] hover:gap-1.5 hover:border-solid hover:border-border cursor-help">
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
                  <span className="font-semibold">Context Window</span>
                  <span className="font-mono">{percent.toFixed(1)}%</span>
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 w-full bg-primary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-muted transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] pt-0.5">
                    <span className="font-mono">{used.toLocaleString()}</span>
                    <span className="font-mono">{size.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ) : null}
            {hasCost ? (
              <div className="flex flex-col">
                {hasContextWindow ? <div className="mb-2 h-px w-full bg-background/20" /> : null}
                <span className="text-[10px] uppercase">Estimated Cost</span>
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
  const totalTokens = usage.totalTokens ?? 0;
  const total = totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens;

  if (usage.totalTokens === undefined) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-all hover:border-border hover:bg-muted/40 hover:text-foreground cursor-help">
            <Coins className="size-3" />
            <span>{total} tokens</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="p-3 w-52 z-100">
          <div className="space-y-1.5">
            <div className="mb-1 pb-1 text-xs font-semibold">
              Turn Token Usage
            </div>
            <div className="h-px w-full bg-background/20" />
            <div className="flex justify-between text-[11px]">
              <span>Input</span>
              <span className="font-mono">{(usage.inputTokens ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>Output</span>
              <span className="font-mono">{(usage.outputTokens ?? 0).toLocaleString()}</span>
            </div>
            {usage.thoughtTokens != null && (
              <div className="flex justify-between text-[11px]">
                <span>Thought</span>
                <span className="font-mono">{(usage.thoughtTokens ?? 0).toLocaleString()}</span>
              </div>
            )}
            {(usage.cachedReadTokens != null || usage.cachedWriteTokens != null) && (
              <div className="mt-1 space-y-1 pt-1">
                <div className="h-px w-full bg-background/20" />
                {usage.cachedReadTokens != null && (
                  <div className="flex justify-between text-[11px]">
                    <span>Cache Read</span>
                    <span className="font-mono">{(usage.cachedReadTokens ?? 0).toLocaleString()}</span>
                  </div>
                )}
                {usage.cachedWriteTokens != null && (
                  <div className="flex justify-between text-[11px]">
                    <span>Cache Write</span>
                    <span className="font-mono">{(usage.cachedWriteTokens ?? 0).toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
            <div className="mt-1 pt-1 text-[11px] font-bold">
              <div className="mb-1 h-px w-full bg-background/20" />
              <div className="flex justify-between">
                <span>Total</span>
                <span className="font-mono">{(usage.totalTokens ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
