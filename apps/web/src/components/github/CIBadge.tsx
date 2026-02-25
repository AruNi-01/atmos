import React from 'react';
import { useGithubCIStatus } from '@/hooks/use-github';
import { useWebSocketStore } from '@/hooks/use-websocket';
import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui';
import { cn } from '@/lib/utils';

interface CIBadgeProps {
  owner: string;
  repo: string;
  branch: string;
  className?: string;
}

export const CIBadge: React.FC<CIBadgeProps> = ({ owner, repo, branch, className }) => {
  const ciStatus = useGithubCIStatus({ owner, repo, branch });
  const send = useWebSocketStore(s => s.send);

  if (!ciStatus) return null;

  const { status, conclusion, url } = ciStatus;

  let icon = <Clock className="size-3.5 text-muted-foreground" />;
  let tooltipText = 'CI Queued';

  if (status === 'in_progress') {
    icon = <Loader2 className="size-3.5 text-yellow-500 animate-spin" />;
    tooltipText = 'CI In Progress';
  } else if (status === 'completed') {
    if (conclusion === 'success') {
      icon = <CheckCircle2 className="size-3.5 text-emerald-500" />;
      tooltipText = 'CI Success';
    } else if (conclusion === 'failure') {
      icon = <AlertCircle className="size-3.5 text-red-500" />;
      tooltipText = 'CI Failed';
    } else {
      icon = <Clock className="size-3.5 text-muted-foreground" />;
      tooltipText = `CI ${conclusion || 'Completed'}`;
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (url) {
      send('github_ci_open_browser', { owner, repo, branch });
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={cn(
              "p-1 rounded-sm hover:bg-sidebar-accent transition-colors flex items-center justify-center cursor-pointer",
              className
            )}
          >
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
