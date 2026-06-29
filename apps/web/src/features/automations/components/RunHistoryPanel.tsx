"use client";

import { useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";
import { Clock3, History, LoaderCircle, RefreshCw } from "lucide-react";

import { StatusBadge } from "@/features/automations/components/automation-common";
import {
  formatDateTime,
  formatShortId,
  formatTargetKind,
  parseGithubRunSource,
} from "@/features/automations/lib/automation-format";
import type { AutomationRunSummary } from "@/features/automations/types";

export function RunHistoryPanel({
  runs,
  loading,
  selectedRunGuid,
  onRefresh,
  onSelectRun,
  className,
}: {
  runs: AutomationRunSummary[];
  loading: boolean;
  selectedRunGuid: string | null;
  onRefresh: () => void;
  onSelectRun: (guid: string) => void;
  className?: string;
}) {
  const t = useTranslations("automation.runHistoryPanel");
  return (
    <div className={cn("flex min-h-0 flex-col rounded-md border border-border bg-background", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="size-4" />
          {t("title")}
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={onRefresh} disabled={loading}>
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading && runs.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-md border border-border bg-muted/20" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="flex h-full min-h-52 items-center justify-center rounded-md border border-dashed border-border bg-muted/10 text-center">
            <div>
              <Clock3 className="mx-auto size-7 text-muted-foreground" />
              <div className="mt-2 text-sm font-medium text-foreground">{t("empty.title")}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t("empty.description")}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <RunHistoryRow
                key={run.guid}
                run={run}
                selected={run.guid === selectedRunGuid}
                onSelect={() => onSelectRun(run.guid)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RunHistoryRow({
  run,
  selected,
  onSelect,
}: {
  run: AutomationRunSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const githubSource = parseGithubRunSource(run);
  const githubLabel = githubSource
    ? [githubSource.repository, githubSource.event].filter(Boolean).join(" / ")
    : "";
  const triggerLabel = githubLabel || run.trigger_kind;

  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        selected ? "border-primary/40 bg-primary/5" : "border-border bg-background hover:bg-muted/30",
      )}
    >
      <button type="button" onClick={onSelect} className="w-full px-3 py-3 text-left">
        <div className="flex items-center justify-between gap-3">
          <StatusBadge status={run.status} />
          <span className="text-xs tabular-nums text-muted-foreground">{formatShortId(run.guid)}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{triggerLabel}</span>
          <span className="text-border">/</span>
          <span>{formatTargetKind(run.target_kind)}</span>
          <span className="text-border">/</span>
          <span>{formatDateTime(run.started_at)}</span>
        </div>
      </button>
    </div>
  );
}
