import React from 'react';
import { useTranslations } from 'next-intl';
import { useGithubCIStatus } from '@/features/github/hooks/use-github';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import { AlertCircle, CheckCircle2, Workflow, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui';
import { cn } from '@/shared/lib/utils';

interface CIBadgeProps {
  owner: string;
  repo: string;
  branch: string;
  className?: string;
}

export const CIBadge: React.FC<CIBadgeProps> = ({ owner, repo, branch, className }) => {
  const t = useTranslations('github.ciBadge');
  const ciStatus = useGithubCIStatus({ owner, repo, branch });
  const send = useWebSocketStore(s => s.send);

  if (!ciStatus) return null;

  const { status, conclusion, url } = ciStatus;

  let icon = <Workflow className="size-3.5 text-muted-foreground" />;
  let tooltipText = t('tooltip.queued');

  if (status === 'in_progress') {
    icon = <Loader2 className="size-3.5 text-yellow-500 animate-spin" />;
    tooltipText = t('tooltip.inProgress');
  } else if (status === 'completed') {
    if (conclusion === 'success') {
      icon = <CheckCircle2 className="size-3.5 text-emerald-500" />;
      tooltipText = t('tooltip.success');
    } else if (conclusion === 'failure') {
      icon = <AlertCircle className="size-3.5 text-red-500" />;
      tooltipText = t('tooltip.failed');
    } else {
      icon = <Workflow className="size-3.5 text-muted-foreground" />;
      tooltipText = t('tooltip.fallback', {
        status: formatGithubActionState(conclusion, t),
      });
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.open(`https://github.com/${owner}/${repo}/actions`, '_blank', 'noopener,noreferrer');
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
