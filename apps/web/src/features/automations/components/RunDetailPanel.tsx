"use client";

import * as React from "react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tabs,
  TabsList,
  TabsTab,
  cn,
} from "@workspace/ui";
import { ChevronDown, FileText, LoaderCircle, Square, Terminal } from "lucide-react";

import {
  ARTIFACT_OPTIONS,
  MetadataItem,
  StatusBadge,
} from "@/features/automations/components/automation-common";
import {
  artifactLabel,
  formatDateTime,
  formatShortId,
  parseGithubRunSource,
} from "@/features/automations/lib/automation-format";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
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
  onContinueInTerminal,
}: {
  run: AutomationRunSummary | null;
  artifact: AutomationArtifactResponse | null;
  artifactLoading: boolean;
  busyAction: string | null;
  onCancelRun: (run: AutomationRunSummary) => Promise<void>;
  onFetchArtifact: (run: AutomationRunSummary, kind: AutomationArtifactKind) => Promise<void>;
  onContinueInTerminal: (run: AutomationRunSummary) => Promise<void>;
}) {
  const [metadataOpen, setMetadataOpen] = React.useState(false);
  const [activeArtifact, setActiveArtifact] = React.useState<AutomationArtifactKind>("final");

  React.useEffect(() => {
    setActiveArtifact("final");
  }, [run?.guid]);

  React.useEffect(() => {
    if (!run) {
      return;
    }
    if (artifact?.run_guid === run.guid && artifact.artifact === activeArtifact) {
      return;
    }
    void onFetchArtifact(run, activeArtifact);
  }, [activeArtifact, artifact?.artifact, artifact?.run_guid, onFetchArtifact, run]);

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

  const githubSource = parseGithubRunSource(run);

  return (
    <div className="flex h-full min-h-0 flex-col">
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
            {run.status !== "running" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onContinueInTerminal(run)}
                disabled={busyAction === `continue:${run.guid}`}
              >
                {busyAction === `continue:${run.guid}` ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Terminal className="size-4" />
                )}
                Continue
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <Collapsible open={metadataOpen} onOpenChange={setMetadataOpen} className="shrink-0 rounded-md border border-border bg-muted/10">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <StatusBadge status={run.status} />
              <span className="text-xs text-muted-foreground">{run.trigger_kind}</span>
              <span className="text-xs text-border">/</span>
              <span className="text-xs tabular-nums text-muted-foreground">{formatDateTime(run.started_at)}</span>
              {run.exit_code !== null ? (
                <>
                  <span className="text-xs text-border">/</span>
                  <span className="text-xs tabular-nums text-muted-foreground">exit {run.exit_code}</span>
                </>
              ) : null}
            </div>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-3 border-t border-border p-3 md:grid-cols-2">
              <MetadataItem label="Status" value={<StatusBadge status={run.status} />} />
              <MetadataItem label="Trigger" value={run.trigger_kind} />
              {githubSource?.repository ? (
                <MetadataItem label="Repository" value={githubSource.repository} />
              ) : null}
              {githubSource?.event ? <MetadataItem label="Event" value={githubSource.event} /> : null}
              {githubSource?.sourceUrl ? (
                <MetadataItem label="Source" value={githubSource.sourceUrl} />
              ) : null}
              <MetadataItem label="Started" value={formatDateTime(run.started_at)} />
              <MetadataItem label="Completed" value={formatDateTime(run.completed_at)} />
              <MetadataItem label="Exit code" value={run.exit_code === null ? "None" : String(run.exit_code)} />
              <MetadataItem
                label="Runner"
                value={run.tmux_window_name ? run.terminal_display_name || "Terminal" : "Background process"}
              />
              {run.error_message ? <MetadataItem label="Error" value={run.error_message} /> : null}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Tabs
          value={activeArtifact}
          onValueChange={(value) => setActiveArtifact(value as AutomationArtifactKind)}
          className="mt-4 min-h-0 flex-1"
        >
          <TabsList className="h-9 shrink-0">
            {ARTIFACT_OPTIONS.map((option) => (
              <TabsTab key={option.kind} value={option.kind} className="px-3 text-xs">
                {artifactLoading && activeArtifact === option.kind ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <FileText className="size-3.5" />
                )}
                {option.label}
              </TabsTab>
            ))}
          </TabsList>

          <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-muted/10">
            <div className="shrink-0 border-b border-border px-3 py-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {artifact ? artifactLabel(artifact.artifact) : artifactLabel(activeArtifact)}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {artifact?.path ?? "Loading artifact contents."}
              </div>
            </div>
            <ArtifactContent
              artifact={artifact?.run_guid === run.guid && artifact.artifact === activeArtifact ? artifact : null}
              activeArtifact={activeArtifact}
              loading={artifactLoading}
            />
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function ArtifactContent({
  artifact,
  activeArtifact,
  loading,
}: {
  artifact: AutomationArtifactResponse | null;
  activeArtifact: AutomationArtifactKind;
  loading: boolean;
}) {
  const content = artifact?.content ?? "";
  const isJson = activeArtifact === "run_json";
  const isJsonl = activeArtifact === "events";
  const formatted = React.useMemo(() => {
    if (!content) {
      return "";
    }
    if (isJson) {
      return formatJson(content);
    }
    if (isJsonl) {
      return formatJsonLines(content);
    }
    return content;
  }, [content, isJson, isJsonl]);

  if (loading && !artifact) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        Loading artifact...
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        No artifact selected.
      </div>
    );
  }

  if (isJson || isJsonl) {
    return (
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-5 text-foreground">
        {formatted}
      </pre>
    );
  }

  return (
    <div className={cn("min-h-0 flex-1 overflow-auto px-4 py-3 text-sm text-foreground")}>
      <MarkdownRenderer className="prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 [&_pre]:max-w-full [&_pre]:overflow-x-auto">
        {formatted || "No content."}
      </MarkdownRenderer>
    </div>
  );
}

function formatJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatJsonLines(raw: string) {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => formatJson(line))
    .join("\n");
}
