import React from 'react';
import { useTranslations } from 'next-intl';
import { useGithubActionsList } from '@/features/github/hooks/use-github';
import { Clock, Loader2, Workflow, CheckCircle2, XCircle, Rocket, Github } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, Button } from '@workspace/ui';
import { formatActionTimestamp, formatActionTimeAgo } from '@/features/github/lib/action-run-time';
import {
  actionRunBadgeClassName,
  getActionRunBadgeTone,
  isActionInProgress,
  isActionQueuedOrPending,
  normalizeActionStatus,
} from '@/features/github/lib/action-run-status';
import type { GithubActionsRunPayload } from '@atmos/api-types/ws/dto/github';

export type ActionRun = GithubActionsRunPayload;

export interface ActionsStats {
  total: number;
  success: number;
  failure: number;
  inProgress: number;
}

export function useProcessedActions(runs: ActionRun[] | null) {
  return React.useMemo(() => {
    if (!runs) return { latestRuns: [], stats: { total: 0, success: 0, failure: 0, inProgress: 0 } };

    const latestRunsMap = new Map<string, ActionRun>();
    const stats: ActionsStats = { total: 0, success: 0, failure: 0, inProgress: 0 };

    // Group by workflowName and keep the latest one (assuming runs are sorted by date desc)
    runs.forEach(run => {
      if (!latestRunsMap.has(run.workflowName)) {
        latestRunsMap.set(run.workflowName, run);
      }

      // Calculate stats for all runs or just latest? 
      // User said "header summary", usually means for the shown items or current state.
      // Let's calculate stats based on ALL runs to give a complete picture of the current branch state?
      // Actually, for "latest triggers", stats on latest unique workflows makes more sense.
    });

    const latestRuns = Array.from(latestRunsMap.values());

    latestRuns.forEach(run => {
      stats.total++;
      if (run.status !== 'completed') {
        stats.inProgress++;
      } else if (run.conclusion === 'success') {
        stats.success++;
      } else if (run.conclusion === 'failure') {
        stats.failure++;
      }
    });

    return { latestRuns, stats };
  }, [runs]);
}

export function ActionsSummaryHeader({ stats, className }: { stats: ActionsStats; className?: string }) {
  const t = useTranslations('github.actionsPanel');
  return (
    <div className={cn("flex items-center gap-3 px-1", className)}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-emerald-500">
              <CheckCircle2 className="size-3.5" />
              <span className="text-xs font-mono font-bold leading-none">{stats.success}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">{t('summary.passed')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-red-500">
              <XCircle className="size-3.5" />
              <span className="text-xs font-mono font-bold leading-none">{stats.failure}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">{t('summary.failed')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-blue-500">
              <Loader2 className="size-3.5" />
              <span className="text-xs font-mono font-bold leading-none">{stats.inProgress}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">{t('summary.inProgress')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

interface ActionsPanelProps {
  owner: string;
  repo: string;
  branch: string;
  onRunClick?: (run: ActionRun) => void;
  enabled?: boolean;
}

export function ActionsPanel({ owner, repo, branch, onRunClick, enabled = true }: ActionsPanelProps) {
  const t = useTranslations('github.actionsPanel');
  const { data: runs, loading } = useGithubActionsList({ owner, repo, branch, enabled });
  const { latestRuns } = useProcessedActions(runs);

  if (loading && !runs) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="size-6 animate-spin opacity-50 mb-4" />
        <span className="text-xs">{t('loading')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {latestRuns.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground/50 py-10">
          <Workflow className="size-8 opacity-20 mb-2" />
          <span className="text-xs text-center">{t('empty')}</span>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
            {latestRuns.map((run) => {
              const isCompleted = normalizeActionStatus(run.status) === 'completed';
              const badgeTone = getActionRunBadgeTone({
                status: run.status,
                conclusion: run.conclusion,
              });
              const showProgressIcon = isActionInProgress(run.status);
              const showPendingIcon =
                !isCompleted && isActionQueuedOrPending(run.status);
              const createdAtTimeAgo = formatActionTimeAgo(run.createdAt);
              const createdAtTimestamp = formatActionTimestamp(run.createdAt);

              return (
                <div
                  key={run.databaseId}
                  onClick={() => onRunClick?.(run)}
                  className="flex flex-col p-3 rounded-md border border-sidebar-border bg-transparent hover:bg-sidebar-accent/50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="min-w-0 truncate text-[13px] font-medium leading-tight text-foreground/90"
                      title={run.workflowName}
                    >
                      {run.workflowName}
                    </span>
                    <div className="ml-2 flex shrink-0 gap-1.5">
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded-sm capitalize flex items-center gap-1",
                              actionRunBadgeClassName(badgeTone),
                            )}>
                              {showProgressIcon && (
                                <Loader2 className="size-3 animate-spin" />
                              )}
                              {showPendingIcon && (
                                <Clock className="size-3" />
                              )}
                              {formatGithubActionState(isCompleted ? run.conclusion : run.status, t)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {t('statusTooltip', {
                              status: formatGithubActionState(run.status, t),
                              conclusion: formatGithubActionState(run.conclusion, t),
                            })}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  <p
                    className="mt-2 line-clamp-2 text-[12px] leading-5 text-muted-foreground"
                    title={run.displayTitle || run.workflowName}
                  >
                    {run.displayTitle || run.workflowName}
                  </p>

                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <Rocket className="size-3.5 shrink-0" />
                      <span className="truncate capitalize">{run.event}</span>
                    </span>
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="shrink-0 cursor-default tabular-nums">
                            {createdAtTimeAgo ?? t('unknownTime')}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[11px]">
                          {createdAtTimestamp ?? t('unknownStartTime')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-sidebar-border/50 bg-sidebar-accent/5 flex flex-col gap-2">
            <p className="text-[11px] text-muted-foreground leading-normal">
              {t('footer.description')}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-[11px] font-medium gap-2"
              onClick={() => window.open(`https://github.com/${owner}/${repo}/actions?query=branch:${branch}`, '_blank')}
            >
              <Github className="size-3.5" />
              {t('footer.viewAllRuns')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function formatGithubActionState(
  value: string | null | undefined,
  t: ReturnType<typeof useTranslations>,
) {
  switch (value) {
    case 'queued':
      return t('states.queued');
    case 'in_progress':
      return t('states.inProgress');
    case 'completed':
      return t('states.completed');
    case 'success':
      return t('states.success');
    case 'failure':
      return t('states.failure');
    case 'skipped':
      return t('states.skipped');
    case 'cancelled':
      return t('states.cancelled');
    case 'neutral':
      return t('states.neutral');
    case 'pending':
      return t('states.pending');
    case 'requested':
      return t('states.requested');
    case 'stale':
      return t('states.stale');
    case 'timed_out':
      return t('states.timedOut');
    case 'action_required':
      return t('states.actionRequired');
    case 'startup_failure':
      return t('states.startupFailure');
    case 'unknown':
    case '':
    case null:
    case undefined:
      return t('states.unknown');
    default:
      return value.replace(/_/g, ' ');
  }
}
