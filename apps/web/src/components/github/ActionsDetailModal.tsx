import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  DialogClose,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Skeleton,
} from '@workspace/ui';
import { useWebSocketStore } from '@/hooks/use-websocket';
import {
  Github,
  ExternalLink,
  XCircle,
  Expand,
  Shrink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Rocket,
  X,
  FileText,
  Clock,
  PlayCircle,
  LoaderCircle,
  RotateCw,
  Box,
  HelpCircle,
} from 'lucide-react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { useGithubActionsDetail } from '@/hooks/use-github';
import { cn } from '@/lib/utils';
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

export function ActionsDetailModal({ owner, repo, run, runId, isOpen, onOpenChange }: ActionsDetailModalProps) {
  const send = useWebSocketStore(s => s.send);
  const [actionLoading, setActionLoading] = React.useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const effectiveRunId = runId ?? run?.databaseId;
  const { data: detail, loading: detailLoading } = useGithubActionsDetail(owner, repo, isOpen ? effectiveRunId : undefined);

  // Merge: prefer the passed-in `run` object; fall back to `detail` (available after fetch on refresh)
  const effectiveRun: ActionRun | null = run ?? (detail ? {
    databaseId: detail.databaseId ?? effectiveRunId!,
    workflowName: detail.workflowName ?? detail.name ?? '',
    displayTitle: detail.displayTitle ?? detail.name ?? '',
    status: detail.status ?? '',
    conclusion: detail.conclusion ?? '',
    createdAt: detail.createdAt ?? '',
    url: detail.url ?? '',
    event: detail.event ?? '',
    headBranch: detail.headBranch ?? detail.head_branch ?? '',
    headSha: detail.headSha ?? detail.head_sha ?? '',
  } : null);

  const handleOpenBrowser = async () => {
    if (!effectiveRun) return;
    setActionLoading(true);
    try {
      await send('github_ci_open_browser', { owner, repo, run_id: effectiveRun.databaseId });
    } catch (e) {
      console.log('Ignore error', e);
      window.open(effectiveRun.url, '_blank');
    } finally {
      setActionLoading(false);
    }
  };

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
                        {format(parseISO(effectiveRun.createdAt), 'PPpp')}
                        ({formatDistanceToNow(parseISO(effectiveRun.createdAt), { addSuffix: true })})
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
                  ) : detail?.jobs && detail.jobs.length > 0 ? (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    detail.jobs.map((job: any) => {
                      const jobSuccess = job.conclusion === 'success';
                      const jobFailure = job.conclusion === 'failure';
                      const jobSkipped = job.conclusion === 'skipped';
                      const jobCompleted = job.status === 'completed';

                      return (
                        <div key={job.databaseId || job.id} className="flex flex-col hover:bg-muted/30 transition-colors">
                          <div className="px-4 py-3 flex items-center gap-3">
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

                            {/* Steps details (hidden on small view normally, shown as summary) */}
                            {job.steps && job.steps.length > 0 && (
                              <div className="hidden sm:flex text-[11px] text-muted-foreground/70 shrink-0 gap-1 opacity-70">
                                <span>{job.steps.length} steps</span>
                              </div>
                            )}

                            {jobCompleted && job.startedAt && job.completedAt && (
                              <div className="text-[11px] text-muted-foreground/80 shrink-0 whitespace-nowrap tabular-nums">
                                {formatDistanceToNow(parseISO(job.startedAt), { addSuffix: true })}
                              </div>
                            )}
                          </div>

                          {/* If Failed Job, expand to show steps */}
                          {jobFailure && job.steps && job.steps.length > 0 && (
                            <div className="pl-11 pr-4 pb-3 flex flex-col gap-1.5">
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {job.steps.map((step: any, idx: number) => {
                                const stepSuccess = step.conclusion === 'success';
                                const stepFailure = step.conclusion === 'failure';

                                return (
                                  <div key={idx} className={cn(
                                    "flex items-start gap-2 text-xs",
                                    stepFailure ? "text-red-500 font-medium" : "text-muted-foreground/80"
                                  )}>
                                    <div className="mt-0.5 shrink-0">
                                      {stepFailure ? <XCircle className="size-3" /> : stepSuccess ? <CheckCircle2 className="size-3 opacity-50" /> : <div className="size-3" />}
                                    </div>
                                    <span className={cn("truncate flex-1 max-w-full", stepFailure && "whitespace-normal break-words")}>{step.name}</span>
                                  </div>
                                );
                              })}
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

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex sm:justify-between items-center bg-background/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-dashed border-border/80 shadow-xl gap-6">
          <div className="flex gap-2.5">
            <Button variant="outline" size="sm" onClick={handleNativeOpen} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3 font-medium">
              <ExternalLink className="mr-1.5 size-3.5" />
              GitHub
            </Button>

            <Button variant="outline" size="sm" onClick={() => window.open(`https://better-hub.com/${owner}/${repo}/actions/runs/${effectiveRun.databaseId}`, '_blank')} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3 font-medium">
              <ExternalLink className="mr-1.5 size-3.5" />
              BetterHub
            </Button>
          </div>

          {(isCompleted) && (
            <div className="w-px h-5 bg-border/40 shrink-0 mx-1" />
          )}

          <div className="flex gap-2.5">
            {isFailure && (
              <Button variant="outline" size="sm" onClick={handleRerunFailed} disabled={actionLoading} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3 font-medium">
                {actionLoading ? <LoaderCircle className="mr-1.5 size-3.5 animate-spin" /> : <RotateCw className="mr-1.5 size-3.5" />}
                Re-run failed jobs
              </Button>
            )}

            {(isCompleted) && (
              <Button variant="default" size="sm" onClick={handleRerunAll} disabled={actionLoading} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3 font-medium">
                {actionLoading ? <LoaderCircle className="mr-1.5 size-3.5 animate-spin" /> : <RotateCw className="mr-1.5 size-3.5" />}
                Re-run all jobs
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowIcon(props: React.ComponentProps<typeof Rocket>) {
  return <Rocket {...props} />;
}
