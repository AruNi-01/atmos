"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@workspace/ui";

import type { PaneAttentionSummary } from "@/features/agent/store/agent-attention-summary-store";

export function AttentionSummaryPanel({
  summary,
  onPickNextStep,
  onDismiss,
}: {
  summary: PaneAttentionSummary;
  onPickNextStep: (step: string) => void;
  onDismiss?: () => void;
}) {
  const t = useTranslations("terminal.attentionSummary");
  const isLoading = summary.status === "summarizing";
  const isReady = summary.status === "ready";
  const isError = summary.status === "error";

  return (
    <div
      className={cn(
        "attention-summary-panel w-full overflow-hidden rounded-[1.25rem] border border-dashed px-3.5 py-3",
        "border-slate-400/45 bg-[#e7eef2]",
        "dark:border-slate-500/30 dark:bg-[#0d171e]",
      )}
      data-status={summary.status}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400">
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : isError ? (
            <XCircle className="size-4 text-amber-500" aria-hidden />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium tracking-wide text-slate-600 dark:text-slate-300">
              {isLoading
                ? t("loadingTitle")
                : isError
                  ? t("errorTitle")
                  : t("readyTitle")}
            </p>
            {isReady && typeof summary.canCloseSession === "boolean" ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                  summary.canCloseSession
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                )}
              >
                {summary.canCloseSession
                  ? t("canCloseBadge")
                  : t("keepOpenBadge")}
              </span>
            ) : null}
            {onDismiss && (isReady || isError) ? (
              <button
                type="button"
                className="ml-auto -mr-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={onDismiss}
              >
                {t("dismiss")}
              </button>
            ) : null}
          </div>

          {isLoading ? (
            <div className="mt-2 space-y-2" aria-busy="true" aria-live="polite">
              <div className="attention-summary-skeleton h-3.5 w-[88%] rounded-full" />
              <div className="attention-summary-skeleton h-3 w-[62%] rounded-full" />
              <div className="mt-3 flex flex-wrap gap-1.5">
                <div className="attention-summary-skeleton h-7 w-24 rounded-full" />
                <div className="attention-summary-skeleton h-7 w-28 rounded-full" />
                <div className="attention-summary-skeleton h-7 w-20 rounded-full" />
              </div>
            </div>
          ) : null}

          {isError ? (
            <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
              {summary.error?.trim() || t("errorFallback")}
            </p>
          ) : null}

          {isReady ? (
            <>
              <p className="mt-1.5 text-sm leading-5 text-foreground">
                {summary.summary}
              </p>
              {summary.nextSteps.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {summary.nextSteps.map((step) => (
                    <button
                      key={step}
                      type="button"
                      className={cn(
                        "max-w-full truncate rounded-full border border-slate-400/40 bg-background",
                        "px-2.5 py-1 text-left text-xs text-foreground transition-colors",
                        "hover:border-slate-400/60 hover:bg-foreground/5",
                      )}
                      onClick={() => onPickNextStep(step)}
                      title={step}
                    >
                      {step}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
