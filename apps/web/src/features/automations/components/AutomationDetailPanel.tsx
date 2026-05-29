"use client";

import * as React from "react";
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui";
import {
  AlertCircle,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Trash2,
  Workflow,
} from "lucide-react";

import { RunDetailPanel } from "@/features/automations/components/RunDetailPanel";
import { RunHistoryPanel } from "@/features/automations/components/RunHistoryPanel";
import { StatusBadge } from "@/features/automations/components/automation-common";
import {
  formatDateTime,
  formatScheduleLabel,
  formatTarget,
} from "@/features/automations/lib/automation-format";
import type {
  AutomationAgentCapability,
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationDetail,
  AutomationRunSummary,
  AutomationSummary,
} from "@/features/automations/types";
import type { Project } from "@/shared/types/domain";

export function AutomationDetailPanel({
  automation,
  detail,
  detailLoading,
  runs,
  runsLoading,
  selectedRun,
  selectedRunGuid,
  artifact,
  artifactLoading,
  busyAction,
  projects,
  agents,
  onEdit,
  onRefreshRuns,
  onRunAction,
  onSelectRun,
  onCancelRun,
  onFetchArtifact,
}: {
  automation: AutomationSummary | null;
  detail: AutomationDetail | null;
  detailLoading: boolean;
  runs: AutomationRunSummary[];
  runsLoading: boolean;
  selectedRun: AutomationRunSummary | null;
  selectedRunGuid: string | null;
  artifact: AutomationArtifactResponse | null;
  artifactLoading: boolean;
  busyAction: string | null;
  projects: Project[];
  agents: AutomationAgentCapability[];
  onEdit: () => void;
  onRefreshRuns: () => void;
  onRunAction: (action: "run" | "pause" | "resume" | "delete", automation: AutomationSummary) => Promise<void>;
  onSelectRun: (guid: string) => void;
  onCancelRun: (run: AutomationRunSummary) => Promise<void>;
  onFetchArtifact: (run: AutomationRunSummary, kind: AutomationArtifactKind) => Promise<void>;
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  if (!automation) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center rounded-md border border-border bg-background">
        <div className="text-center">
          <Workflow className="mx-auto size-8 text-muted-foreground" />
          <div className="mt-3 text-sm font-medium text-foreground">Select an automation</div>
          <div className="mt-1 text-xs text-muted-foreground">Run history and artifacts appear here.</div>
        </div>
      </section>
    );
  }

  const agent = agents.find((item) => item.agent_id === automation.agent_id);
  const pauseResumeAction = automation.schedule_paused ? "resume" : "pause";
  const pauseResumeLabel = automation.schedule_paused ? "Resume" : "Pause";
  const latestRun = runs[0] ?? null;
  const deleteBusy = busyAction === `delete:${automation.guid}`;
  const pausedAfterStartFailure =
    automation.schedule_paused &&
    latestRun?.trigger_kind === "scheduled" &&
    latestRun.failure_kind === "start_failed"
      ? latestRun
      : null;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">
                {automation.display_name}
              </h3>
              {automation.schedule_paused ? <Badge variant="outline">Paused</Badge> : null}
              {automation.last_status ? <StatusBadge status={automation.last_status} /> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{agent?.label ?? automation.agent_id}</span>
              <span className="text-border">/</span>
              <span>{formatTarget(automation, projects)}</span>
              <span className="text-border">/</span>
              <span>{formatScheduleLabel(automation)}</span>
              {automation.next_run_at ? (
                <>
                  <span className="text-border">/</span>
                  <span>next {formatDateTime(automation.next_run_at)}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onRunAction("run", automation)}
              disabled={busyAction === `run:${automation.guid}`}
            >
              {busyAction === `run:${automation.guid}` ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Run Now
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onRunAction(pauseResumeAction, automation)}
              disabled={!automation.schedule_enabled || busyAction === `${pauseResumeAction}:${automation.guid}`}
            >
              {busyAction === `${pauseResumeAction}:${automation.guid}` ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : automation.schedule_paused ? (
                <Play className="size-4" />
              ) : (
                <Pause className="size-4" />
              )}
              {pauseResumeLabel}
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit} disabled={!detail && detailLoading}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Popover open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={deleteBusy}
                  className="text-destructive hover:text-destructive"
                >
                  {deleteBusy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Delete
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} className="w-72 p-3">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Delete this automation?</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {automation.display_name} will be removed, including its saved schedule and GitHub trigger route.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deleteBusy}
                      onClick={() => setDeleteConfirmOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deleteBusy}
                      onClick={async () => {
                        await onRunAction("delete", automation);
                        setDeleteConfirmOpen(false);
                      }}
                    >
                      {deleteBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      Delete
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        {pausedAfterStartFailure ? (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium">Schedule paused after a start failure</div>
                <div className="mt-1 line-clamp-2 text-xs text-destructive/80">
                  {pausedAfterStartFailure.error_message ??
                    "Fix the agent, target, or instructions, then resume this automation."}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => void onRunAction("resume", automation)}
              disabled={busyAction === `resume:${automation.guid}`}
            >
              {busyAction === `resume:${automation.guid}` ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Resume schedule
            </Button>
          </div>
        ) : null}
        {detailLoading ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            Loading instructions
          </div>
        ) : detail?.instructions ? (
          <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Agent Instructions
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap text-sm text-foreground">{detail.instructions}</p>
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <RunHistoryPanel
          runs={runs}
          loading={runsLoading}
          selectedRunGuid={selectedRunGuid}
          busyAction={busyAction}
          onRefresh={onRefreshRuns}
          onSelectRun={onSelectRun}
          onCancelRun={onCancelRun}
        />
        <RunDetailPanel
          run={selectedRun}
          artifact={artifact}
          artifactLoading={artifactLoading}
          busyAction={busyAction}
          onCancelRun={onCancelRun}
          onFetchArtifact={onFetchArtifact}
        />
      </div>
    </section>
  );
}
