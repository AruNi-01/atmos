import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  DialogClose,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Skeleton,
} from '@workspace/ui';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import {
  ExternalLink,
  XCircle,
  Expand,
  Shrink,
  Loader2,
  CheckCircle2,
  Rocket,
  X,
  Clock,
  LoaderCircle,
  RotateCw,
  Box,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';
import { useGithubActionsDetail } from '@/features/github/hooks/use-github';
import { formatActionDuration, formatActionTimestamp, formatActionTimeAgo } from '@/features/github/lib/action-run-time';
import { cn } from '@/shared/lib/utils';
import { type ActionRun } from './ActionsPanel';

interface ActionsDetailModalProps {
  owner: string;
  repo: string;
  /** Full run object — available when opened from click, null on page refresh. */
  run: ActionRun | null;
  /** Unique run ID used to fetch detail; drives isOpen when provided. */
  runId: number | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ActionStep {
  name?: string;
  status?: string;
  conclusion?: string;
  number?: number;
  startedAt?: string;
  started_at?: string;
  completedAt?: string;
  completed_at?: string;
}

interface ActionJob {
  databaseId?: number;
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string;
  startedAt?: string;
  started_at?: string;
  completedAt?: string;
  completed_at?: string;
  url?: string;
  html_url?: string;
  steps?: ActionStep[];
}

export function ActionsDetailModal({ owner, repo, run, runId, isOpen, onOpenChange }: ActionsDetailModalProps) {
  const send = useWebSocketStore(s => s.send);
  const [actionLoading, setActionLoading] = React.useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [expandedJobIds, setExpandedJobIds] = React.useState<Set<string>>(() => new Set());
  const [selectedStepKey, setSelectedStepKey] = React.useState<string | null>(null);

  const effectiveRunId = runId ?? run?.databaseId;
  const { data: detail, loading: detailLoading } = useGithubActionsDetail(owner, repo, isOpen ? effectiveRunId : undefined);
  const jobs = React.useMemo(() => Array.isArray(detail?.jobs) ? detail.jobs as ActionJob[] : [], [detail?.jobs]);

  const toggleJob = React.useCallback((jobKey: string) => {
    setExpandedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(jobKey)) {
        next.delete(jobKey);
      } else {
        next.add(jobKey);
      }
      return next;
    });
  }, []);

  // Merge: prefer the passed-in `run` object; fall back to `detail` (available after fetch on refresh)
  const effectiveRun: ActionRun | null = run ?? (detail ? {
    databaseId: detail.databaseId ?? detail.id ?? effectiveRunId!,
    workflowName: detail.workflowName ?? detail.workflow_name ?? detail.name ?? '',
    displayTitle: detail.displayTitle ?? detail.display_title ?? detail.name ?? '',
    status: detail.status ?? '',
    conclusion: detail.conclusion ?? '',
    createdAt: detail.createdAt ?? detail.created_at ?? detail.run_started_at ?? '',
    url: detail.url ?? detail.html_url ?? '',
    event: detail.event ?? '',
    headBranch: detail.headBranch ?? detail.head_branch ?? '',
    headSha: detail.headSha ?? detail.head_sha ?? '',
  } : null);

  const handleRerunAll = async () => {
    if (!effectiveRun) return;
    setActionLoading(true);
    try {
      await send('github_actions_rerun', { owner, repo, run_id: effectiveRun.databaseId, failed_only: false });
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
      onOpenChange(false);
    }
  };

  const handleRerunFailed = async () => {
    if (!effectiveRun) return;
    setActionLoading(true);
    try {
      await send('github_actions_rerun', { owner, repo, run_id: effectiveRun.databaseId, failed_only: true });
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
      onOpenChange(false);
    }
  };

  const handleNativeOpen = () => {
    if (!effectiveRun) return;
    window.open(effectiveRun.url, '_blank');
  };

  React.useEffect(() => {
    if (!isOpen || !effectiveRunId || jobs.length === 0) {
      setExpandedJobIds(new Set());
      setSelectedStepKey(null);
      return;
    }

    setExpandedJobIds(new Set(
      jobs
        .map((job, index) => ({ job, index }))
        .filter(({ job }) => job.conclusion === 'failure')
        .map(({ job, index }) => getActionJobKey(job, index)),
    ));
    setSelectedStepKey(null);
  }, [effectiveRunId, isOpen, jobs]);

  // Still loading initial data on refresh — show dialog with loading skeleton
  if (!effectiveRun) {
    if (!isOpen) return null;
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="max-w-2xl sm:max-w-2xl w-full h-[80vh] px-6 pb-6 pt-0 flex flex-col gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Loading Workflow Run</DialogTitle>
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-6 animate-spin opacity-50" />
              <span className="text-xs">Loading Workflow Run...</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isSuccess = effectiveRun.conclusion === 'success';
  const isFailure = effectiveRun.conclusion === 'failure';
  const isCompleted = effectiveRun.status === 'completed';
  const createdAtTimestamp = formatActionTimestamp(effectiveRun.createdAt);
  const createdAtTimeAgo = formatActionTimeAgo(effectiveRun.createdAt);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "transition-all duration-200 flex flex-col gap-0 overflow-hidden",
          isFullscreen ? "max-w-none sm:max-w-none w-screen sm:w-screen h-screen max-h-screen px-6 pb-6 pt-0 m-0 border-none rounded-none" : "max-w-2xl sm:max-w-2xl w-full h-[80vh] px-6 pb-6 pt-0"
        )}
      >
        <div className="flex-1 overflow-y-auto min-h-[400px] pr-4 -mr-4 pb-16 relative no-scrollbar">
          <DialogHeader className="pr-24 flex flex-row items-center gap-3 space-y-0 pt-6 pb-4 shrink-0 relative">
            <WorkflowIcon className="size-4.5 text-muted-foreground/60" />
            <div className="flex items-center gap-2.5 min-w-0">
              <DialogTitle className="text-base font-bold whitespace-nowrap">Workflow Run #{effectiveRun.databaseId}</DialogTitle>
              <span className="text-muted-foreground/30 font-light select-none">|</span>
              <DialogDescription className="text-[11px] text-muted-foreground/60 truncate pt-0.5 font-medium" title={`${owner}/${repo}`}>
                {owner}/{repo}
              </DialogDescription>
            </div>

            {/* Modal Controls in Header */}
            <div className="absolute right-0 top-6 flex items-center gap-1">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted/80 transition-colors opacity-70 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFullscreen(!isFullscreen);
                }}
              >
                {isFullscreen ? <Shrink className="size-3.5" /> : <Expand className="size-3.5" />}
              </button>
              <DialogClose asChild>
                <button className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted/80 transition-colors opacity-70 hover:opacity-100">
                  <X className="size-4" />
                </button>
              </DialogClose>
            </div>
          </DialogHeader>

          <div className="flex flex-col text-sm relative">
            <div className="shrink-0 pb-4 pt-1 border-b border-border/50 sticky top-0 z-30 bg-background/98 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">{effectiveRun.displayTitle}</h3>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1.5 bg-muted/50 px-1.5 py-0.5 rounded-md border border-border/50 shadow-sm shrink-0">
                  <Rocket className="size-3.5" />
                  <span className="font-semibold text-foreground/90">{effectiveRun.workflowName}</span>
                </div>
                <span>triggered via</span>
                <span className="bg-primary/10 text-primary px-1.5 py-px rounded font-mono truncate shadow-sm capitalize mr-1">
                  {effectiveRun.event}
                </span>

                {detailLoading && !detail?.actor && (
                  <div className="flex items-center gap-1.5 mr-1 bg-muted/20 px-1.5 py-1 rounded-md border border-border/30">
                    <Skeleton className="size-3.5 rounded-full bg-muted-foreground/20" />
                    <Skeleton className="h-3 w-16 bg-muted-foreground/20" />
                  </div>
                )}

                {detail?.actor && (
                  <div className="flex items-center gap-1.5 mr-1 bg-muted/40 px-1.5 py-0.5 rounded-md border border-border/50 shadow-sm">
                    <Avatar className="size-3.5 border border-border/50">
                      <AvatarImage src={detail.actor.avatar_url || detail.actor.avatarUrl} />
                      <AvatarFallback className="text-[7px]">{detail.actor.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-foreground/90">{detail.actor.login}</span>
                  </div>
                )}

                <span>on target branch</span>
                <span className="bg-secondary px-1.5 py-px text-secondary-foreground rounded font-mono truncate max-w-[200px] shadow-sm">
                  {effectiveRun.headBranch || 'unknown'}
                </span>
                {effectiveRun.headSha && (
                  <>
                    <span>at commit</span>
                    <span className="bg-sidebar-accent px-1.5 py-px text-sidebar-foreground rounded font-mono truncate max-w-[100px] shadow-sm">
                      {effectiveRun.headSha.substring(0, 7)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="pt-6 flex flex-col gap-4">
              {/* Actions Status Section */}
              <div className="flex flex-col gap-3 py-2">
                <div className={cn(
                  "flex items-start gap-4 p-4 border rounded-xl transition-all",
                  isCompleted ? (
                    isSuccess ? "bg-emerald-500/5 border-emerald-500/20 shadow-sm" : "bg-red-500/5 border-red-500/20 shadow-sm"
                  ) : "bg-blue-500/5 border-blue-500/20 shadow-sm"
                )}>
                  <div className={cn(
                    "mt-0.5 rounded-full p-1.5 shadow-sm",
                    isCompleted ? (
                      isSuccess ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                    ) : "bg-blue-500 text-white animate-pulse"
                  )}>
                    {isCompleted ? (
                      isSuccess ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />
                    ) : (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h5 className="text-sm font-bold flex items-center justify-between capitalize">
                      {isCompleted ? `${effectiveRun.conclusion} ` : `${effectiveRun.status} `}
                      <span className="text-[10px] text-muted-foreground font-normal normal-case flex items-center gap-1">
                        <Clock className="size-3" />
                        {createdAtTimestamp ?? 'Unknown start time'}
                        {createdAtTimeAgo && ` (${createdAtTimeAgo})`}
                      </span>
                    </h5>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex flex-col gap-1">
                      This workflow run is currently {isCompleted ? effectiveRun.conclusion : effectiveRun.status}.
                    </p>
                  </div>
                </div>
              </div>

              {/* Jobs Summary Section */}
              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Box className="size-3.5" /> Jobs
                </h4>
                <div className="border rounded-xl flex flex-col divide-y divide-border overflow-hidden bg-background">
                  {detailLoading ? (
                    <div className="flex flex-col">
                      {[1, 2].map((i) => (
                        <div key={`skel-job-${i}`} className="flex flex-col border-b border-border/50 last:border-0">
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
                            {[1, 2, 3, 4, 5].map((stepIdx) => (
                              <div key={`skel-step-${i}-${stepIdx}`} className="flex items-center gap-2">
                                <Skeleton className="size-3.5 rounded-full bg-muted-foreground/10 shrink-0" />
                                <Skeleton
                                  className={cn(
                                    "h-3 rounded-md bg-muted-foreground/10",
                                    stepIdx === 1 ? "w-24" : stepIdx === 2 ? "w-40" : stepIdx === 3 ? "w-48" : stepIdx === 4 ? "w-32" : "w-20"
                                  )}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : jobs.length > 0 ? (
                    jobs.map((job, jobIndex) => {
                      const jobKey = getActionJobKey(job, jobIndex);
                      const steps = Array.isArray(job.steps) ? job.steps : [];
                      const jobSuccess = job.conclusion === 'success';
                      const jobFailure = job.conclusion === 'failure';
                      const jobSkipped = job.conclusion === 'skipped';
                      const jobCompleted = job.status === 'completed';
                      const jobStartedAtTimeAgo = formatActionTimeAgo(getStartedAt(job));
                      const isExpanded = expandedJobIds.has(jobKey);
                      const canExpand = steps.length > 0;

                      return (
                        <div key={jobKey} className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => {
                              if (canExpand) toggleJob(jobKey);
                            }}
                            aria-expanded={canExpand ? isExpanded : undefined}
                            className={cn(
                              "px-4 py-3 flex w-full items-center gap-3 text-left transition-colors",
                              canExpand ? "cursor-pointer hover:bg-muted/30" : "cursor-default",
                              isExpanded && "bg-muted/20",
                            )}
                          >
                            <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground/60 transition-transform", !isExpanded && "-rotate-90", !canExpand && "opacity-0")} />
                            <div className="shrink-0 flex items-center justify-center">
                              {jobCompleted ? (
                                jobSuccess ? <CheckCircle2 className="size-4 text-emerald-500" /> :
                                  jobFailure ? <XCircle className="size-4 text-red-500" /> :
                                    jobSkipped ? <div className="size-4 rounded-full border-2 border-muted-foreground/40 flex items-center justify-center" /> :
                                      <HelpCircle className="size-4 text-muted-foreground" />
                              ) : (
                                <Loader2 className="size-4 animate-spin text-blue-500" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="font-semibold text-sm truncate">{job.name}</span>
                              {jobSkipped && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-sm shrink-0">skipped</span>}
                            </div>

                            {steps.length > 0 && (
                              <div className="hidden sm:flex text-[11px] text-muted-foreground/70 shrink-0 gap-1 opacity-70">
                                <span>{steps.length} steps</span>
                              </div>
                            )}

                            {jobCompleted && jobStartedAtTimeAgo && (
                              <div className="text-[11px] text-muted-foreground/80 shrink-0 whitespace-nowrap tabular-nums">
                                {jobStartedAtTimeAgo}
                              </div>
                            )}
                          </button>

                          {steps.length > 0 && (
                            <div
                              className={cn(
                                "grid overflow-hidden transition-[grid-template-rows,opacity,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                                isExpanded ? "grid-rows-[1fr] border-t border-border/40 opacity-100" : "grid-rows-[0fr] border-t border-transparent opacity-0",
                              )}
                            >
                              <div className="min-h-0 overflow-hidden">
                                <div className="bg-muted/10 px-4 py-3">
                                  <div className="ml-6 flex flex-col gap-1.5">
                                    {steps.map((step, stepIndex) => {
                                      const stepKey = getActionStepKey(jobKey, step, stepIndex);
                                      const isSelected = selectedStepKey === stepKey;
                                      const stepStatus = step.conclusion || step.status || 'unknown';
                                      const stepStartedAt = getStartedAt(step);
                                      const stepCompletedAt = getCompletedAt(step);
                                      const stepStartedLabel = formatActionTimestamp(stepStartedAt);
                                      const stepCompletedLabel = formatActionTimestamp(stepCompletedAt);
                                      const stepDuration = formatActionDuration(stepStartedAt, stepCompletedAt);

                                      return (
                                        <div
                                          key={stepKey}
                                          role="button"
                                          tabIndex={isExpanded ? 0 : -1}
                                          onClick={() => setSelectedStepKey(isSelected ? null : stepKey)}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                              event.preventDefault();
                                              setSelectedStepKey(isSelected ? null : stepKey);
                                            }
                                          }}
                                          className={cn(
                                            "group/step flex cursor-pointer items-start gap-2 rounded-md border px-2 py-2 text-xs transition-colors outline-none",
                                            isSelected ? "border-border/70 bg-background shadow-sm" : "border-transparent text-muted-foreground/85 hover:bg-background/70 focus-visible:border-ring/40",
                                          )}
                                        >
                                          <div className="mt-0.5 shrink-0">
                                            <StepStatusIcon status={step.status} conclusion={step.conclusion} />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-3">
                                              <span className={cn("min-w-0 truncate font-medium", step.conclusion === 'failure' ? "text-red-500" : "text-foreground/90")}>
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
                                                  aria-label={`Open ${step.name || 'step'} on GitHub`}
                                                  tabIndex={isExpanded ? 0 : -1}
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    openActionStepInGitHub(owner, repo, effectiveRun.databaseId, job, step);
                                                  }}
                                                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover/step:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                                >
                                                  <ExternalLink className="size-3" />
                                                </button>
                                              </div>
                                            </div>

                                            {isSelected && (
                                              <div className="mt-2 grid grid-cols-1 gap-1.5 rounded-md border border-border/40 bg-muted/20 p-2 sm:grid-cols-2">
                                                <StepMeta label="Status" value={stepStatus} />
                                                <StepMeta label="Duration" value={stepDuration ?? '-'} />
                                                <StepMeta label="Started" value={stepStartedLabel ?? '-'} />
                                                <StepMeta label="Completed" value={stepCompletedLabel ?? '-'} />
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
                          )}
                        </div>
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

            </div>
          </div>
        </div>

        <ActionsActionBar
          actionLoading={actionLoading}
          isCompleted={isCompleted}
          isFailure={isFailure}
          onOpenGitHub={handleNativeOpen}
          onOpenBetterHub={() => window.open(`https://better-hub.com/${owner}/${repo}/actions/runs/${effectiveRun.databaseId}`, '_blank')}
          onRerunFailed={handleRerunFailed}
          onRerunAll={handleRerunAll}
        />
      </DialogContent>
    </Dialog>
  );
}

function getStartedAt(value: { startedAt?: string; started_at?: string }) {
  return value.startedAt ?? value.started_at ?? null;
}

function getCompletedAt(value: { completedAt?: string; completed_at?: string }) {
  return value.completedAt ?? value.completed_at ?? null;
}

function getActionJobKey(job: ActionJob, index: number) {
  return String(job.databaseId ?? job.id ?? `${job.name ?? 'job'}-${index}`);
}

function getActionStepKey(jobKey: string, step: ActionStep, index: number) {
  return `${jobKey}:${step.number ?? step.name ?? index}`;
}

function openActionStepInGitHub(owner: string, repo: string, runId: number, job: ActionJob, step: ActionStep) {
  const jobId = job.databaseId ?? job.id;
  const rawJobUrl = job.html_url ?? (job.url && !job.url.includes('api.github.com') ? job.url : undefined);
  const jobUrl = rawJobUrl ?? (jobId
    ? `https://github.com/${owner}/${repo}/actions/runs/${runId}/job/${jobId}`
    : `https://github.com/${owner}/${repo}/actions/runs/${runId}`);
  const href = jobId && step.number ? `${jobUrl}#step:${step.number}:1` : jobUrl;
  window.open(href, '_blank');
}

function StepStatusIcon({ status, conclusion }: { status?: string; conclusion?: string }) {
  if (conclusion === 'success') {
    return <CheckCircle2 className="size-3.5 text-emerald-500" />;
  }
  if (conclusion === 'failure') {
    return <XCircle className="size-3.5 text-red-500" />;
  }
  if (conclusion === 'skipped') {
    return <div className="size-3.5 rounded-full border-2 border-muted-foreground/40" />;
  }
  if (status === 'in_progress' || status === 'queued') {
    return <Loader2 className="size-3.5 animate-spin text-blue-500" />;
  }
  return <HelpCircle className="size-3.5 text-muted-foreground" />;
}

function StepMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground/70">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-[10px] text-foreground/80 capitalize">{value}</span>
    </div>
  );
}

function ActionsActionBar({
  actionLoading,
  isCompleted,
  isFailure,
  onOpenGitHub,
  onOpenBetterHub,
  onRerunFailed,
  onRerunAll,
}: {
  actionLoading: boolean;
  isCompleted: boolean;
  isFailure: boolean;
  onOpenGitHub: () => void;
  onOpenBetterHub: () => void;
  onRerunFailed: () => void;
  onRerunAll: () => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [shouldRenderToolbar, setShouldRenderToolbar] = React.useState(false);
  const [isToolbarHovered, setIsToolbarHovered] = React.useState(false);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFrameRef = React.useRef<number | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (openFrameRef.current != null) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
  }, []);

  const scheduleOpenAfterMount = React.useCallback(() => {
    openFrameRef.current = requestAnimationFrame(() => {
      openFrameRef.current = requestAnimationFrame(() => {
        setIsOpen(true);
        openFrameRef.current = null;
      });
    });
  }, []);

  const openToolbar = React.useCallback(() => {
    cancelClose();
    if (shouldRenderToolbar) {
      setIsOpen(true);
      return;
    }
    setShouldRenderToolbar(true);
    scheduleOpenAfterMount();
  }, [cancelClose, scheduleOpenAfterMount, shouldRenderToolbar]);

  const closeToolbar = React.useCallback(() => {
    cancelClose();
    setIsOpen(false);
    closeTimeoutRef.current = setTimeout(() => {
      setShouldRenderToolbar(false);
      closeTimeoutRef.current = null;
    }, 220);
  }, [cancelClose]);

  const scheduleClose = React.useCallback(() => {
    closeToolbar();
  }, [closeToolbar]);

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      if (openFrameRef.current != null) {
        cancelAnimationFrame(openFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 justify-center">
      <div className="pointer-events-auto relative flex items-end justify-center">
        {shouldRenderToolbar && (
          <div
            onMouseEnter={() => {
              setIsToolbarHovered(true);
              cancelClose();
            }}
            onMouseLeave={() => {
              setIsToolbarHovered(false);
              scheduleClose();
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget) && !isToolbarHovered) {
                scheduleClose();
              }
            }}
            aria-hidden={!isOpen}
            className={cn(
              "absolute bottom-full left-1/2 z-10 flex max-w-[calc(100vw-3rem)] -translate-x-1/2 items-center gap-6 whitespace-nowrap rounded-xl border border-dashed border-border/80 bg-background/90 px-4 py-2.5 shadow-xl backdrop-blur-md",
              !isOpen
                ? "pointer-events-none opacity-0 transition-opacity duration-220 ease-in"
                : "pointer-events-auto opacity-100 transition-opacity duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]",
            )}
          >
            <div className="absolute left-1/2 top-full h-4 w-24 -translate-x-1/2" />
            <div className="flex gap-2.5">
              <Button variant="outline" size="sm" onClick={onOpenGitHub} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3 font-medium">
                <ExternalLink className="mr-1.5 size-3.5" />
                GitHub
              </Button>

              <Button variant="outline" size="sm" onClick={onOpenBetterHub} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3 font-medium">
                <ExternalLink className="mr-1.5 size-3.5" />
                BetterHub
              </Button>
            </div>

            {isCompleted && (
              <>
                <div className="w-px h-5 bg-border/40 shrink-0 mx-1" />

                <div className="flex gap-2.5">
                  {isFailure && (
                    <Button variant="outline" size="sm" onClick={onRerunFailed} disabled={actionLoading} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3 font-medium">
                      {actionLoading ? <LoaderCircle className="mr-1.5 size-3.5 animate-spin" /> : <RotateCw className="mr-1.5 size-3.5" />}
                      Re-run failed jobs
                    </Button>
                  )}

                  <Button variant="default" size="sm" onClick={onRerunAll} disabled={actionLoading} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3 font-medium">
                    {actionLoading ? <LoaderCircle className="mr-1.5 size-3.5 animate-spin" /> : <RotateCw className="mr-1.5 size-3.5" />}
                    Re-run all jobs
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          aria-label="Show workflow actions"
          onClick={openToolbar}
          onFocus={openToolbar}
          onMouseEnter={openToolbar}
          className={cn(
            "h-1.5 w-40 rounded-full border-0 bg-foreground/20 p-0 shadow-[0_1px_8px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            !isOpen
              ? "pointer-events-auto opacity-100 transition-opacity duration-220 ease-in"
              : "pointer-events-none opacity-0 transition-opacity duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]",
          )}
        />
      </div>
    </div>
  );
}

function WorkflowIcon(props: React.ComponentProps<typeof Rocket>) {
  return <Rocket {...props} />;
}
