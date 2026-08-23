"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "@workspace/ui";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/motion/tabs";
import { ChevronDown, FileText, LoaderCircle, Square, Terminal } from "lucide-react";

import {
  ARTIFACT_OPTIONS,
  AutomationAgentLabel,
  MetadataItem,
  StatusBadge,
} from "@/features/automations/components/automation-common";
import {
  formatDateTime,
  formatShortId,
  parseGithubRunSource,
} from "@/features/automations/lib/automation-format";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import type {
  AutomationAgentCapability,
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationRunSummary,
  AutomationTriggerKind,
} from "@/features/automations/types";

export function RunDetailPanel({
  run,
  agents,
  artifact,
  artifactLoading,
  busyAction,
  onCancelRun,
  onFetchArtifact,
  onContinueInTerminal,
  headerClassName,
}: {
  run: AutomationRunSummary | null;
  agents: AutomationAgentCapability[];
  artifact: AutomationArtifactResponse | null;
  artifactLoading: boolean;
  busyAction: string | null;
  onCancelRun: (run: AutomationRunSummary) => Promise<void>;
  onFetchArtifact: (run: AutomationRunSummary, kind: AutomationArtifactKind) => Promise<void>;
  onContinueInTerminal: (run: AutomationRunSummary) => Promise<void>;
  headerClassName?: string;
}) {
  const t = useTranslations("automation.runDetailPanel");
  const [metadataOpen, setMetadataOpen] = React.useState(false);
  const [activeArtifact, setActiveArtifact] = React.useState<AutomationArtifactKind>("final");
  const runAgentId = run?.agent_id ?? null;
  const runAgentLabel = run?.agent_label ?? null;
  const runnerAgent = React.useMemo<AutomationAgentCapability | null>(() => {
    if (!runAgentId) {
      return null;
    }

    const capability = agents.find((agent) => agent.agent_id === runAgentId);
    if (capability) {
      return {
        ...capability,
        label: runAgentLabel ?? capability.label,
      };
    }

    if (runAgentLabel) {
      return {
        agent_id: runAgentId,
        label: runAgentLabel,
        installed: false,
        automation_supported: false,
        model_input_mode: "none",
        reasoning_mode: "none",
        supports_extra_args: true,
        unavailable_reason: null,
      };
    }

    return null;
  }, [agents, runAgentId, runAgentLabel]);

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
          <div className="mt-3 text-sm font-medium text-foreground">{t("empty.title")}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t("empty.description")}</div>
        </div>
      </div>
    );
  }

  const githubSource = parseGithubRunSource(run);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("px-4 py-3", headerClassName)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="size-4 shrink-0" />
            <span className="truncate">{t("title")}</span>
            <span className="truncate font-mono text-xs font-normal tabular-nums text-muted-foreground">
              {formatShortId(run.guid)}
            </span>
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
                {t("actions.cancel")}
              </Button>
            ) : null}
            {run.status !== "running" ? (
              <Button
                size="sm"
                onClick={() => void onContinueInTerminal(run)}
                disabled={busyAction === `continue:${run.guid}`}
              >
                {busyAction === `continue:${run.guid}` ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Terminal className="size-4" />
                )}
                {t("actions.continue")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <Collapsible open={metadataOpen} onOpenChange={setMetadataOpen} className="shrink-0 overflow-hidden rounded-md border border-border bg-muted/10">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <StatusBadge status={run.status} />
              <span className="text-xs text-muted-foreground">{triggerKindLabel(t, run.trigger_kind)}</span>
              <span className="text-xs text-border">/</span>
              <span className="text-xs tabular-nums text-muted-foreground">{formatDateTime(run.started_at)}</span>
              {run.exit_code !== null ? (
                <>
                  <span className="text-xs text-border">/</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t("inline.exitCode", { code: run.exit_code })}
                  </span>
                </>
              ) : null}
            </div>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-3 border-t border-border p-3 md:grid-cols-2">
              <MetadataItem label={t("metadata.status")} value={<StatusBadge status={run.status} />} />
              <MetadataItem label={t("metadata.trigger")} value={triggerKindLabel(t, run.trigger_kind)} />
              {githubSource?.repository ? (
                <MetadataItem label={t("metadata.repository")} value={githubSource.repository} />
              ) : null}
              {githubSource?.event ? <MetadataItem label={t("metadata.event")} value={githubSource.event} /> : null}
              {githubSource?.sourceUrl ? (
                <MetadataItem label={t("metadata.source")} value={githubSource.sourceUrl} />
              ) : null}
              <MetadataItem label={t("metadata.started")} value={formatDateTime(run.started_at)} />
              <MetadataItem label={t("metadata.completed")} value={formatDateTime(run.completed_at)} />
              <MetadataItem label={t("metadata.exitCode")} value={run.exit_code === null ? t("metadata.none") : String(run.exit_code)} />
              <MetadataItem
                label={t("metadata.runner")}
                value={
                  runAgentId ? (
                    <AutomationAgentLabel
                      agent={runnerAgent}
                      agentId={runAgentId}
                      agentConfigJson={run.agent_config_json}
                      iconSize={16}
                    />
                  ) : run.tmux_window_name ? (
                    run.terminal_display_name || t("metadata.terminal")
                  ) : (
                    t("metadata.backgroundProcess")
                  )
                }
              />
              {run.error_message ? <MetadataItem label={t("metadata.error")} value={run.error_message} /> : null}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Tabs
          value={activeArtifact}
          onValueChange={(value) => setActiveArtifact(value as AutomationArtifactKind)}
          variant="pill"
          className="mt-4 flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="h-8 w-fit shrink-0 gap-0.5 self-start p-0.5">
            {ARTIFACT_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <TabsTrigger key={option.kind} value={option.kind} className="h-7 gap-1.5 px-3 text-xs">
                  {artifactLoading && activeArtifact === option.kind ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Icon className="size-3.5" />
                  )}
                  {option.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-muted/10">
            <ArtifactContent
              artifact={artifact?.run_guid === run.guid && artifact.artifact === activeArtifact ? artifact : null}
              activeArtifact={activeArtifact}
              loading={artifactLoading}
              running={run.status === "running"}
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
  running,
}: {
  artifact: AutomationArtifactResponse | null;
  activeArtifact: AutomationArtifactKind;
  loading: boolean;
  running: boolean;
}) {
  const t = useTranslations("automation.runDetailPanel");
  const content = artifact?.content ?? "";
  const isJson = activeArtifact === "run_json";
  const isXml = activeArtifact === "prompt";
  const scrollRef = React.useRef<HTMLElement | null>(null);
  const stickToBottomRef = React.useRef(true);
  const formatted = React.useMemo(() => {
    if (!content) {
      return "";
    }
    if (isJson) {
      return formatJson(content);
    }
    return content;
  }, [content, isJson]);

  React.useEffect(() => {
    stickToBottomRef.current = true;
  }, [activeArtifact, artifact?.run_guid]);

  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element || !stickToBottomRef.current) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [formatted]);

  const handleScroll = React.useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    stickToBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }, []);

  if (loading && !artifact) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {t("artifact.loading")}
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {t("artifact.noneSelected")}
      </div>
    );
  }

  if (isJson || isXml) {
    return (
      <pre
        ref={scrollRef as React.RefObject<HTMLPreElement>}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-5 text-foreground"
      >
        {formatted || (running ? t("artifact.waitingForOutput") : t("artifact.noContent"))}
      </pre>
    );
  }

  return (
    <div
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      onScroll={handleScroll}
      className={cn("min-h-0 flex-1 overflow-auto px-4 py-3 text-sm text-foreground")}
    >
      <MarkdownRenderer className="prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 [&_pre]:max-w-full [&_pre]:overflow-x-auto">
        {formatted || (running ? t("artifact.waitingForOutput") : t("artifact.noContent"))}
      </MarkdownRenderer>
    </div>
  );
}

function triggerKindLabel(
  t: ReturnType<typeof useTranslations<"automation.runDetailPanel">>,
  kind: AutomationTriggerKind,
) {
  switch (kind) {
    case "github":
      return t("trigger.github");
    case "scheduled":
      return t("trigger.scheduled");
    default:
      return t("trigger.manual");
  }
}

function formatJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
