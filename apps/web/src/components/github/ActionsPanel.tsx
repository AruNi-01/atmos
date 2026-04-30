import React from 'react';
import { useGithubActionsList } from '@/hooks/use-github';
import { ExternalLink, Search, Loader2, Workflow, CheckCircle2, XCircle, FileText, Rocket, Github, AlertCircle } from 'lucide-react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { OverlayScroll, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, Button } from '@workspace/ui';

export interface ActionRun {
  databaseId: number;
  workflowName: string;
  displayTitle: string;
  status: string;
  conclusion: string;
  createdAt: string;
  url: string;
  event: string;
  headBranch: string;
  headSha: string;
}

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
          <TooltipContent side="top">Passed</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-red-500">
              <XCircle className="size-3.5" />
              <span className="text-xs font-mono font-bold leading-none">{stats.failure}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">Failed</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-blue-500">
              <Loader2 className="size-3.5" />
              <span className="text-xs font-mono font-bold leading-none">{stats.inProgress}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">In Progress</TooltipContent>
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
  refreshKey?: number;
}

export function ActionsPanel({ owner, repo, branch, onRunClick, refreshKey }: ActionsPanelProps) {
  const { data: runs, loading } = useGithubActionsList({ owner, repo, branch });
  const { latestRuns, stats } = useProcessedActions(runs);

  if (loading && !runs) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="size-6 animate-spin opacity-50 mb-4" />
        <span className="text-xs">Loading Workflows...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {latestRuns.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground/50 py-10">
          <Workflow className="size-8 opacity-20 mb-2" />
          <span className="text-xs text-center">No Actions workflow runs found.</span>
        </div>
      ) : (
        <>
          <div className="px-3 h-8 flex items-center justify-between shrink-0 border-b border-sidebar-border/50">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none">Latest Workflows</span>
            <ActionsSummaryHeader stats={stats} />
          </div>

          <OverlayScroll className="flex-1 min-h-0">
            <div className="p-2 space-y-2">
            {latestRuns.map((run) => {
              const isSuccess = run.conclusion === 'success';
              const isFailure = run.conclusion === 'failure';
              const isCompleted = run.status === 'completed';

              return (
                <div
                  key={run.databaseId}
                  onClick={() => onRunClick?.(run)}
                  className="flex flex-col p-3 rounded-md border border-sidebar-border bg-transparent hover:bg-sidebar-accent/50 transition-colors cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[13px] font-medium leading-tight group-hover:text-foreground line-clamp-2">
                      {run.displayTitle || run.workflowName}
                    </span>
                    <div className="flex gap-1.5 ml-2 shrink-0">
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded-sm capitalize flex items-center gap-1",
                              isCompleted ? (
                                isSuccess ? 'bg-emerald-500/10 text-emerald-500' :
                                  isFailure ? 'bg-red-500/10 text-red-500' :
                                    'bg-zinc-500/10 text-zinc-500'
                              ) : "bg-blue-500/10 text-blue-500"
                            )}>
                              {!isCompleted && <Loader2 className="size-3 animate-spin" />}
                              {isCompleted ? run.conclusion : run.status}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            Status: {run.status}, Conclusion: {run.conclusion}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-2">
                    <Rocket className="size-3.5 shrink-0" />
                    <span className="font-medium truncate max-w-[120px] text-foreground/80" title={run.workflowName}>
                      {run.workflowName}
                    </span>
                    <span>•</span>
                    <span className="capitalize">{run.event}</span>
                    <span>•</span>
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default">
                            {formatDistanceToNow(parseISO(run.createdAt), { addSuffix: true })}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[11px]">
                          {format(parseISO(run.createdAt), 'PPpp')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              );
            })}
            </div>
          </OverlayScroll>

          <div className="p-3 border-t border-sidebar-border/50 bg-sidebar-accent/5 flex flex-col gap-2">
            <p className="text-[11px] text-muted-foreground leading-normal">
              Only the latest run for each active workflow is shown here. Check full history on GitHub.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-[11px] font-medium gap-2"
              onClick={() => window.open(`https://github.com/${owner}/${repo}/actions?query=branch:${branch}`, '_blank')}
            >
              <Github className="size-3.5" />
              View All Runs
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
