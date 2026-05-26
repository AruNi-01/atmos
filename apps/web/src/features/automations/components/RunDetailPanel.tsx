"use client";

import { Button, Separator } from "@workspace/ui";
import { ExternalLink, FileText, LoaderCircle, Square } from "lucide-react";

import {
  ARTIFACT_OPTIONS,
  MetadataItem,
  StatusBadge,
} from "@/features/automations/components/automation-common";
import { openArtifactPath } from "@/features/automations/lib/automation-artifacts";
import {
  artifactLabel,
  formatDateTime,
  formatShortId,
} from "@/features/automations/lib/automation-format";
import type {
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationRunSummary,
} from "@/features/automations/types";

export function RunDetailPanel({
  run,
  artifact,
  artifactLoading,
  busyAction,
  onCancelRun,
  onFetchArtifact,
}: {
  run: AutomationRunSummary | null;
  artifact: AutomationArtifactResponse | null;
  artifactLoading: boolean;
  busyAction: string | null;
  onCancelRun: (run: AutomationRunSummary) => Promise<void>;
  onFetchArtifact: (run: AutomationRunSummary, kind: AutomationArtifactKind) => Promise<void>;
}) {
  if (!run) {
    return (
      <div className="flex min-h-0 items-center justify-center p-6 text-center">
        <div>
          <FileText className="mx-auto size-8 text-muted-foreground" />
          <div className="mt-3 text-sm font-medium text-foreground">Select a run</div>
          <div className="mt-1 text-xs text-muted-foreground">Artifacts and terminal metadata appear here.</div>
        </div>
      </div>
    );
  }

  const openPath = artifact?.path ?? run.result_path;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="size-4" />
              Run Detail
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{formatShortId(run.guid)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {run.status === "running" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onCancelRun(run)}
                disabled={busyAction === `cancel:${run.guid}`}
              >
                {busyAction === `cancel:${run.guid}` ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4" />
                )}
                Cancel
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openArtifactPath(openPath)}
              disabled={!openPath}
            >
              <ExternalLink className="size-4" />
              Open Path
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <MetadataItem label="Status" value={<StatusBadge status={run.status} />} />
          <MetadataItem label="Trigger" value={run.trigger_kind} />
          <MetadataItem label="Started" value={formatDateTime(run.started_at)} />
          <MetadataItem label="Completed" value={formatDateTime(run.completed_at)} />
          <MetadataItem label="Exit code" value={run.exit_code === null ? "None" : String(run.exit_code)} />
          <MetadataItem label="Terminal" value={run.terminal_display_name || "Automations"} />
          <MetadataItem label="Session" value={run.tmux_session_name ?? "None"} />
          <MetadataItem label="Window" value={run.tmux_window_name ?? "None"} />
          {run.error_message ? <MetadataItem label="Error" value={run.error_message} /> : null}
        </div>

        <Separator className="my-4" />

        <div className="flex flex-wrap gap-2">
          {ARTIFACT_OPTIONS.map((option) => (
            <Button
              key={option.kind}
              variant={artifact?.artifact === option.kind ? "secondary" : "outline"}
              size="sm"
              onClick={() => void onFetchArtifact(run, option.kind)}
              disabled={artifactLoading}
            >
              {artifactLoading && artifact?.artifact === option.kind ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              {option.label}
            </Button>
          ))}
        </div>

        <div className="mt-4 rounded-md border border-border bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {artifact ? artifactLabel(artifact.artifact) : "Artifact"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {artifact?.path ?? "Fetch an artifact to inspect its contents."}
              </div>
            </div>
            {artifact?.path ? (
              <Button variant="ghost" size="sm" onClick={() => void openArtifactPath(artifact.path)}>
                <ExternalLink className="size-4" />
                Open
              </Button>
            ) : null}
          </div>
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-5 text-foreground">
            {artifactLoading ? "Loading artifact..." : artifact?.content ?? "No artifact selected."}
          </pre>
        </div>
      </div>
    </div>
  );
}
