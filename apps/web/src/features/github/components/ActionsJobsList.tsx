import React from "react";
import { Skeleton } from "@workspace/ui";
import {
  Box,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  Loader2,
  XCircle,
} from "lucide-react";
import { AgentFixButton } from "@/features/agent-fix/components/AgentFixButton";
import type {
  AgentFixContextRef,
  AgentFixPromptSource,
} from "@/features/agent-fix/types";
import {
  formatActionDuration,
  formatActionTimestamp,
  formatActionTimeAgo,
} from "@/features/github/lib/action-run-time";
import { buildGithubActionsJobFixPrompt } from "@/features/github/lib/agent-fix-prompts";
import { cn } from "@/shared/lib/utils";
import type { ActionRun } from "./ActionsPanel";
import type { ActionJob, ActionStep } from "./actions-detail-types";

export function ActionsJobsList({
  agentFixContext,
  detailLoading,
  isOpen,
  jobs,
  owner,
  repo,
  run,
  runId,
}: {
  agentFixContext: AgentFixContextRef | null;
  detailLoading: boolean;
  isOpen: boolean;
  jobs: ActionJob[];
  owner: string;
  repo: string;
  run: ActionRun;
  runId: number | null | undefined;
}) {
  const [expandedJobIds, setExpandedJobIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [selectedStepKey, setSelectedStepKey] = React.useState<string | null>(
    null,
  );
  const [openAgentFixSettingsSourceId, setOpenAgentFixSettingsSourceId] =
    React.useState<string | null>(null);

  const toggleJob = React.useCallback((jobKey: string) => {
    setExpandedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobKey)) {
        next.delete(jobKey);
      } else {
        next.add(jobKey);
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (!isOpen || !runId || jobs.length === 0) {
      setExpandedJobIds(new Set());
      setSelectedStepKey(null);
      return;
    }

    setExpandedJobIds(
      new Set(
        jobs
          .map((job, index) => ({ job, index }))
          .filter(({ job }) => job.conclusion === "failure")
          .map(({ job, index }) => getActionJobKey(job, index)),
      ),
    );
    setSelectedStepKey(null);
  }, [isOpen, jobs, runId]);

  React.useEffect(() => {
    setOpenAgentFixSettingsSourceId(null);
  }, [isOpen, runId]);

  const buildJobAgentFixSource = React.useCallback(
    (job: ActionJob) => {
      const jobName = job.name || run.workflowName || "job";
      return {
        id: `ci-job:${owner}/${repo}:${run.databaseId}:${job.databaseId ?? job.id ?? jobName}`,
        family: "ci_job" as const,
        context: agentFixContext,
        label: `Fix CI: ${jobName}`,
        disabledReason: agentFixContext
          ? null
          : "Open a workspace or project to run Agent Fix.",
        getPrompt: () => ({
          prompt: buildGithubActionsJobFixPrompt({
            owner,
            repo,
            run,
            job,
          }),
          terminalTabTitle: `Fix CI: ${jobName}`,
          terminalPaneLabel: `Fix ${jobName}`,
        }),
      };
    },
    [agentFixContext, owner, repo, run],
  );

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Box className="size-3.5" /> Jobs
      </h4>
      <div className="border rounded-xl flex flex-col divide-y divide-border overflow-hidden bg-background">
        {detailLoading ? (
          <ActionsJobsSkeleton />
        ) : jobs.length > 0 ? (
          jobs.map((job, jobIndex) => {
            const jobKey = getActionJobKey(job, jobIndex);
            const steps = Array.isArray(job.steps) ? job.steps : [];
            const jobFailure = job.conclusion === "failure";
            const agentFixSource = jobFailure
              ? buildJobAgentFixSource(job)
              : null;
            const agentFixSettingsOpen =
              !!agentFixSource &&
              openAgentFixSettingsSourceId === agentFixSource.id;

            return (
              <ActionJobRow
                key={jobKey}
                agentFixSettingsOpen={agentFixSettingsOpen}
                agentFixSource={agentFixSource}
                job={job}
                jobKey={jobKey}
                owner={owner}
                repo={repo}
                runId={run.databaseId}
                selectedStepKey={selectedStepKey}
                steps={steps}
                onAgentFixSettingsSourceChange={setOpenAgentFixSettingsSourceId}
                onSelectedStepKeyChange={setSelectedStepKey}
                isExpanded={expandedJobIds.has(jobKey)}
                onToggleJob={toggleJob}
              />
            );
          })
        ) : (
          <div className="py-8 text-center text-xs text-muted-foreground/60 flex flex-col items-center">
            <Box className="size-8 opacity-20 mb-2" />
            No jobs found in this workflow run.
          </div>
        )}
      </div>
    </div>
  );
}

function ActionsJobsSkeleton() {
  return (
    <div className="flex flex-col">
      {[1, 2].map((index) => (
        <div
          key={`skel-job-${index}`}
          className="flex flex-col border-b border-border/50 last:border-0"
        >
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="shrink-0 flex items-center justify-center">
              <Skeleton className="size-4 rounded-full bg-muted-foreground/20" />
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Skeleton className="h-4 w-28 rounded-md bg-muted-foreground/20" />
            </div>
            <Skeleton className="h-3 w-12 rounded-md hidden sm:block bg-muted-foreground/20" />
            <Skeleton className="h-3 w-24 rounded-md bg-muted-foreground/20" />
          </div>

          <div className="pl-11 pr-4 pb-4 flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map((stepIndex) => (
              <div
                key={`skel-step-${index}-${stepIndex}`}
                className="flex items-center gap-2"
              >
                <Skeleton className="size-3.5 rounded-full bg-muted-foreground/10 shrink-0" />
                <Skeleton
                  className={cn(
                    "h-3 rounded-md bg-muted-foreground/10",
                    stepIndex === 1
                      ? "w-24"
                      : stepIndex === 2
                        ? "w-40"
                        : stepIndex === 3
                          ? "w-48"
                          : stepIndex === 4
                            ? "w-32"
                            : "w-20",
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionJobRow({
  agentFixSettingsOpen,
  agentFixSource,
  isExpanded,
  job,
  jobKey,
  onAgentFixSettingsSourceChange,
  onSelectedStepKeyChange,
  onToggleJob,
  owner,
  repo,
  runId,
  selectedStepKey,
  steps,
}: {
  agentFixSettingsOpen: boolean;
  agentFixSource: AgentFixPromptSource | null;
  isExpanded: boolean;
  job: ActionJob;
  jobKey: string;
  onAgentFixSettingsSourceChange: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  onSelectedStepKeyChange: React.Dispatch<React.SetStateAction<string | null>>;
  onToggleJob: (jobKey: string) => void;
  owner: string;
  repo: string;
  runId: number;
  selectedStepKey: string | null;
  steps: ActionStep[];
}) {
  const jobSuccess = job.conclusion === "success";
  const jobFailure = job.conclusion === "failure";
  const jobSkipped = job.conclusion === "skipped";
  const jobCompleted = job.status === "completed";
  const jobStartedAtTimeAgo = formatActionTimeAgo(getStartedAt(job));
  const canExpand = steps.length > 0;

  return (
    <div className="flex flex-col">
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (canExpand) onToggleJob(jobKey);
        }}
        onKeyDown={(event) => {
          if (!canExpand) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggleJob(jobKey);
          }
        }}
        aria-expanded={canExpand ? isExpanded : undefined}
        className={cn(
          "group px-4 py-3 flex w-full items-center gap-3 text-left transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)]",
          canExpand ? "cursor-pointer hover:bg-muted/30" : "cursor-default",
          isExpanded && "bg-muted/20",
        )}
      >
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-180 ease-[cubic-bezier(0.22,1,0.36,1)]",
            !isExpanded && "-rotate-90",
            !canExpand && "opacity-0",
          )}
        />
        <div className="shrink-0 flex items-center justify-center">
          <ActionJobStatusIcon
            completed={jobCompleted}
            failure={jobFailure}
            skipped={jobSkipped}
            success={jobSuccess}
          />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-semibold text-sm truncate">{job.name}</span>
          {jobSkipped && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-sm shrink-0">
              skipped
            </span>
          )}
        </div>

        {steps.length > 0 && (
          <div className="hidden sm:flex text-[11px] text-muted-foreground/70 shrink-0 gap-1 opacity-70">
            <span>{steps.length} steps</span>
          </div>
        )}

        {jobCompleted && jobStartedAtTimeAgo && (
          <ActionJobTrailingMeta
            agentFixSettingsOpen={agentFixSettingsOpen}
            agentFixSource={agentFixSource}
            jobFailure={jobFailure}
            jobStartedAtTimeAgo={jobStartedAtTimeAgo}
            onAgentFixSettingsSourceChange={onAgentFixSettingsSourceChange}
          />
        )}
      </div>

      {steps.length > 0 && (
        <ActionStepsList
          isExpanded={isExpanded}
          job={job}
          jobKey={jobKey}
          owner={owner}
          repo={repo}
          runId={runId}
          selectedStepKey={selectedStepKey}
          steps={steps}
          onSelectedStepKeyChange={onSelectedStepKeyChange}
        />
      )}
    </div>
  );
}

function ActionJobTrailingMeta({
  agentFixSettingsOpen,
  agentFixSource,
  jobFailure,
  jobStartedAtTimeAgo,
  onAgentFixSettingsSourceChange,
}: {
  agentFixSettingsOpen: boolean;
  agentFixSource: AgentFixPromptSource | null;
  jobFailure: boolean;
  jobStartedAtTimeAgo: string;
  onAgentFixSettingsSourceChange: React.Dispatch<
    React.SetStateAction<string | null>
  >;
}) {
  if (!jobFailure) {
    return (
      <div className="shrink-0 whitespace-nowrap tabular-nums">
        <span className="text-[11px] text-muted-foreground/80">
          {jobStartedAtTimeAgo}
        </span>
      </div>
    );
  }

  return (
    <div className="shrink-0 whitespace-nowrap tabular-nums">
      <span className="relative inline-flex min-w-[92px] justify-end">
        <span
          className={cn(
            "text-[11px] text-muted-foreground/80 group-hover:opacity-0 group-focus-visible:opacity-0",
            agentFixSettingsOpen && "!opacity-0",
          )}
          style={agentFixSettingsOpen ? { opacity: 0 } : undefined}
        >
          {jobStartedAtTimeAgo}
        </span>
        <span
          className={cn(
            "invisible pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 opacity-0",
            "group-hover:visible group-hover:pointer-events-auto group-hover:opacity-100",
            "group-focus-visible:visible group-focus-visible:pointer-events-auto group-focus-visible:opacity-100",
            agentFixSettingsOpen &&
              "!visible !pointer-events-auto !opacity-100",
          )}
          data-agent-fix-action-host="true"
          style={agentFixSettingsOpen ? { opacity: 1 } : undefined}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {agentFixSource ? (
            <AgentFixButton
              source={agentFixSource}
              mode="label"
              appearance="subtle"
              onSettingsOpenChange={(open) => {
                onAgentFixSettingsSourceChange((current) => {
                  if (open) return agentFixSource.id;
                  return current === agentFixSource.id ? null : current;
                });
              }}
            />
          ) : null}
        </span>
      </span>
    </div>
  );
}

function ActionStepsList({
  isExpanded,
  job,
  jobKey,
  onSelectedStepKeyChange,
  owner,
  repo,
  runId,
  selectedStepKey,
  steps,
}: {
  isExpanded: boolean;
  job: ActionJob;
  jobKey: string;
  onSelectedStepKeyChange: React.Dispatch<React.SetStateAction<string | null>>;
  owner: string;
  repo: string;
  runId: number;
  selectedStepKey: string | null;
  steps: ActionStep[];
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden transition-[grid-template-rows,opacity,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        isExpanded
          ? "grid-rows-[1fr] border-t border-border/40 opacity-100"
          : "grid-rows-[0fr] border-t border-transparent opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="bg-muted/10 px-4 py-3">
          <div className="ml-6 flex flex-col gap-1.5">
            {steps.map((step, stepIndex) => {
              const stepKey = getActionStepKey(jobKey, step, stepIndex);
              const isSelected = selectedStepKey === stepKey;
              const stepStatus = step.conclusion || step.status || "unknown";
              const stepStartedAt = getStartedAt(step);
              const stepCompletedAt = getCompletedAt(step);
              const stepStartedLabel = formatActionTimestamp(stepStartedAt);
              const stepCompletedLabel = formatActionTimestamp(stepCompletedAt);
              const stepDuration = formatActionDuration(
                stepStartedAt,
                stepCompletedAt,
              );

              return (
                <div
                  key={stepKey}
                  role="button"
                  tabIndex={isExpanded ? 0 : -1}
                  onClick={() =>
                    onSelectedStepKeyChange(isSelected ? null : stepKey)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectedStepKeyChange(isSelected ? null : stepKey);
                    }
                  }}
                  className={cn(
                    "group/step flex cursor-pointer items-start gap-2 rounded-md border px-2 py-2 text-xs transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none",
                    isSelected
                      ? "border-border/70 bg-background shadow-sm"
                      : "border-transparent text-muted-foreground/85 hover:bg-background/70 focus-visible:border-ring/40",
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    <StepStatusIcon
                      status={step.status}
                      conclusion={step.conclusion}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={cn(
                          "min-w-0 truncate font-medium",
                          step.conclusion === "failure"
                            ? "text-red-500"
                            : "text-foreground/90",
                        )}
                      >
                        {step.name || `Step ${stepIndex + 1}`}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        {stepDuration && (
                          <span className="hidden font-mono text-[10px] text-muted-foreground/70 sm:inline">
                            {stepDuration}
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={`Open ${step.name || "step"} on GitHub`}
                          tabIndex={isExpanded ? 0 : -1}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            openActionStepInGitHub(
                              owner,
                              repo,
                              runId,
                              job,
                              step,
                            );
                          }}
                          className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted hover:text-foreground group-hover/step:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          <ExternalLink className="size-3" />
                        </button>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-2 grid grid-cols-1 gap-1.5 rounded-md border border-border/40 bg-muted/20 p-2 sm:grid-cols-2">
                        <StepMeta label="Status" value={stepStatus} />
                        <StepMeta label="Duration" value={stepDuration ?? "-"} />
                        <StepMeta
                          label="Started"
                          value={stepStartedLabel ?? "-"}
                        />
                        <StepMeta
                          label="Completed"
                          value={stepCompletedLabel ?? "-"}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function getStartedAt(value: { startedAt?: string; started_at?: string }) {
  return value.startedAt ?? value.started_at ?? null;
}

function getCompletedAt(value: {
  completedAt?: string;
  completed_at?: string;
}) {
  return value.completedAt ?? value.completed_at ?? null;
}

function getActionJobKey(job: ActionJob, index: number) {
  return String(job.databaseId ?? job.id ?? `${job.name ?? "job"}-${index}`);
}

function getActionStepKey(jobKey: string, step: ActionStep, index: number) {
  return `${jobKey}:${step.number ?? step.name ?? index}`;
}

function openActionStepInGitHub(
  owner: string,
  repo: string,
  runId: number,
  job: ActionJob,
  step: ActionStep,
) {
  const jobId = job.databaseId ?? job.id;
  const rawJobUrl =
    job.html_url ??
    (job.url && !job.url.includes("api.github.com") ? job.url : undefined);
  const jobUrl =
    rawJobUrl ??
    (jobId
      ? `https://github.com/${owner}/${repo}/actions/runs/${runId}/job/${jobId}`
      : `https://github.com/${owner}/${repo}/actions/runs/${runId}`);
  const href =
    jobId && step.number ? `${jobUrl}#step:${step.number}:1` : jobUrl;
  window.open(href, "_blank", "noopener,noreferrer");
}

function ActionJobStatusIcon({
  completed,
  failure,
  skipped,
  success,
}: {
  completed: boolean;
  failure: boolean;
  skipped: boolean;
  success: boolean;
}) {
  if (!completed) {
    return <Loader2 className="size-4 animate-spin text-blue-500" />;
  }
  if (success) {
    return <CheckCircle2 className="size-4 text-emerald-500" />;
  }
  if (failure) {
    return <XCircle className="size-4 text-red-500" />;
  }
  if (skipped) {
    return (
      <div className="size-4 rounded-full border-2 border-muted-foreground/40 flex items-center justify-center" />
    );
  }
  return <HelpCircle className="size-4 text-muted-foreground" />;
}

function StepStatusIcon({
  status,
  conclusion,
}: {
  status?: string;
  conclusion?: string;
}) {
  if (conclusion === "success") {
    return <CheckCircle2 className="size-3.5 text-emerald-500" />;
  }
  if (conclusion === "failure") {
    return <XCircle className="size-3.5 text-red-500" />;
  }
  if (conclusion === "skipped") {
    return (
      <div className="size-3.5 rounded-full border-2 border-muted-foreground/40" />
    );
  }
  if (status === "in_progress" || status === "queued") {
    return <Loader2 className="size-3.5 animate-spin text-blue-500" />;
  }
  return <HelpCircle className="size-3.5 text-muted-foreground" />;
}

function StepMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground/70">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-mono text-[10px] text-foreground/80 capitalize">
        {value}
      </span>
    </div>
  );
}
