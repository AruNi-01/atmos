import React from 'react';
import { useGithubActionsList } from '@/hooks/use-github';
import { Search, Loader2, Workflow, CheckCircle2, XCircle, FileText, Rocket, Github } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@workspace/ui';

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

interface ActionsPanelProps {
  owner: string;
  repo: string;
  branch: string;
  onRunClick?: (run: ActionRun) => void;
}

export function ActionsPanel({ owner, repo, branch, onRunClick }: ActionsPanelProps) {
  const { data: runs, loading } = useGithubActionsList({ owner, repo, branch });

  if (loading && !runs) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="size-6 animate-spin opacity-50 mb-4" />
        <span className="text-xs">Loading Workflows...</span>
      </div>
    );
  }

  const actionsList: ActionRun[] = runs || [];

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto no-scrollbar p-2">
      {actionsList.length === 0 ? (
        <div className="flex flex-col items-center text-muted-foreground/50 py-10">
          <Workflow className="size-8 opacity-20 mb-2" />
          <span className="text-xs text-center">No Actions workflow runs found.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {actionsList.map((run) => {
            const isSuccess = run.conclusion === 'success';
            const isFailure = run.conclusion === 'failure';
            const isCompleted = run.status === 'completed';

            return (
              <div
                key={run.databaseId}
                onClick={() => onRunClick?.(run)}
                className="flex flex-col p-3 rounded-md border border-sidebar-border bg-sidebar-accent/30 hover:bg-sidebar-accent/80 transition-colors cursor-pointer group"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[13px] font-medium leading-tight group-hover:text-foreground line-clamp-2">
                    {run.displayTitle}
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
                  <span title={new Date(run.createdAt).toLocaleString()}>
                    {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
