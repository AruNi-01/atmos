"use client";

import { Button, cn } from "@workspace/ui";
import { Clock3, History, LoaderCircle, RefreshCw, Square } from "lucide-react";

import { StatusBadge } from "@/features/automations/components/automation-common";
import {
  formatDateTime,
  formatShortId,
  formatTargetKind,
} from "@/features/automations/lib/automation-format";
import type { AutomationRunSummary } from "@/features/automations/types";

export function RunHistoryPanel({
  runs,
  loading,
  selectedRunGuid,
  busyAction,
  onRefresh,
  onSelectRun,
  onCancelRun,
}: {
  runs: AutomationRunSummary[];
  loading: boolean;
  selectedRunGuid: string | null;
  busyAction: string | null;
  onRefresh: () => void;
  onSelectRun: (guid: string) => void;
  onCancelRun: (run: AutomationRunSummary) => Promise<void>;
}) {
  return (
    <div className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="size-4" />
          Run History
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
              <div className="mt-2 text-sm font-medium text-foreground">No runs yet</div>
              <div className="mt-1 text-xs text-muted-foreground">Manual and scheduled outcomes will appear here.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <RunHistoryRow
                key={run.guid}
                run={run}
                selected={run.guid === selectedRunGuid}
                busy={busyAction === `cancel:${run.guid}`}
                onSelect={() => onSelectRun(run.guid)}
                onCancel={() => void onCancelRun(run)}
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
  busy,
  onSelect,
  onCancel,
}: {
  run: AutomationRunSummary;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onCancel: () => void;
}) {
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
          <span>{run.trigger_kind}</span>
          <span className="text-border">/</span>
          <span>{formatTargetKind(run.target_kind)}</span>
          <span className="text-border">/</span>
          <span>{formatDateTime(run.started_at)}</span>
        </div>
      </button>
      {run.status === "running" ? (
        <div className="border-t border-border px-3 py-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Square className="size-4" />}
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
