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
        "attention-summary-panel mb-1.5 w-full overflow-hidden rounded-2xl border px-3.5 py-3",
        "border-sky-500/35 bg-sky-500/8 shadow-[0_10px_28px_rgba(14,165,233,0.12)]",
        "dark:border-sky-400/30 dark:bg-sky-400/10",
      )}
      data-status={summary.status}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0 text-sky-500 dark:text-sky-300">
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
            <p className="text-xs font-medium tracking-wide text-sky-700 dark:text-sky-200">
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
                className="ml-auto text-[11px] text-muted-foreground transition-colors hover:text-foreground"
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
                        "max-w-full truncate rounded-full border border-sky-500/30 bg-background/80",
                        "px-2.5 py-1 text-left text-xs text-foreground transition-colors",
                        "hover:border-sky-500/55 hover:bg-sky-500/10",
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
