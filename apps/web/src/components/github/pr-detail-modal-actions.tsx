import React from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
} from '@workspace/ui';
import {
  Check,
  ChevronDown,
  ExternalLink,
  GitMerge,
  Loader2,
  LoaderCircle,
  RotateCw,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type PRMergeStrategy = 'merge' | 'squash' | 'rebase';

interface PRActionBarModel {
  state?: string;
  isDraft?: boolean;
  mergeable?: string;
  commits?: unknown[];
}

interface PRActionBarProps {
  loading: boolean;
  pr?: PRActionBarModel | null;
  actionLoading: 'merge' | 'close' | 'reopen' | 'comment' | null;
  mergeStrategy: PRMergeStrategy;
  onMergeStrategyChange: (strategy: PRMergeStrategy) => void;
  onOpenGitHub: () => void;
  onOpenBetterHub: () => void;
  onClose: () => void;
  onMerge: () => void;
  onReopen: () => void;
}

export function PRActionBar({
  loading,
  pr,
  actionLoading,
  mergeStrategy,
  onMergeStrategyChange,
  onOpenGitHub,
  onOpenBetterHub,
  onClose,
  onMerge,
  onReopen,
}: PRActionBarProps) {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex sm:justify-between items-center bg-background/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-dashed border-border/80 shadow-xl gap-6">
      <div className="flex gap-2.5">
        <Button variant="outline" size="sm" onClick={onOpenGitHub} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3">
          <ExternalLink className="mr-1.5 size-3.5" />
          GitHub
        </Button>

        <Button variant="outline" size="sm" onClick={onOpenBetterHub} className="shadow-sm hover:shadow-md transition-shadow h-8 text-[11px] px-3">
          <ExternalLink className="mr-1.5 size-3.5" />
          BetterHub
        </Button>
      </div>

      <div className="w-px h-5 bg-border/40 shrink-0 mx-1" />

      <div className="flex gap-2.5">
        {loading ? (
          <>
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-32 rounded-md" />
          </>
        ) : pr?.state === 'OPEN' ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              onClick={onClose}
              disabled={!!actionLoading}
              className="shadow-sm hover:shadow-md hover:bg-red-600 transition-all"
            >
              {actionLoading === 'close' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <XCircle className="mr-2 size-4" />}
              Close PR
            </Button>
            <div className="flex h-8 items-stretch gap-px shadow-sm rounded-md overflow-hidden">
              <Button
                variant="default"
                size="sm"
                onClick={onMerge}
                disabled={!!actionLoading || pr.isDraft || pr.mergeable !== 'MERGEABLE'}
                className={cn(
                  "rounded-none h-full shadow-none transition-all transform active:scale-[0.98] text-white border-r border-white/10",
                  (pr.isDraft || pr.mergeable !== 'MERGEABLE') ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
                )}
              >
                {actionLoading === 'merge' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <GitMerge className="mr-2 size-4" />}
                {mergeStrategy === 'merge' ? 'Merge pull request' : mergeStrategy === 'squash' ? 'Squash and merge' : 'Rebase and merge'}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className={cn(
                      "px-2 rounded-none h-full min-w-0 shadow-none transition-all text-white",
                      (pr.isDraft || pr.mergeable !== 'MERGEABLE') ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
                    )}
                    disabled={!!actionLoading || pr.isDraft || pr.mergeable !== 'MERGEABLE'}
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[320px] p-1">
                  <MergeStrategyItem
                    title="Create a merge commit"
                    description="All commits from this branch will be added to the base branch via a merge commit."
                    selected={mergeStrategy === 'merge'}
                    onSelect={() => onMergeStrategyChange('merge')}
                  />
                  <div className="h-px bg-border/40 my-1" />
                  <MergeStrategyItem
                    title="Squash and merge"
                    description={`The ${pr.commits?.length || 0} commits from this branch will be combined into one commit in the base branch.`}
                    selected={mergeStrategy === 'squash'}
                    onSelect={() => onMergeStrategyChange('squash')}
                  />
                  <div className="h-px bg-border/40 my-1" />
                  <MergeStrategyItem
                    title="Rebase and merge"
                    description={`The ${pr.commits?.length || 0} commits from this branch will be rebased and added to the base branch.`}
                    selected={mergeStrategy === 'rebase'}
                    onSelect={() => onMergeStrategyChange('rebase')}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        ) : pr?.state === 'CLOSED' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onReopen}
            disabled={!!actionLoading}
            className="shadow-sm hover:shadow-md transition-all font-semibold"
          >
            {actionLoading === 'reopen' ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <RotateCw className="mr-2 size-4" />}
            Reopen PR
          </Button>
        ) : pr?.state === 'MERGED' ? (
          <Button
            variant="secondary"
            size="sm"
            disabled
            className="shadow-sm bg-purple-600/90 text-white opacity-100 cursor-default"
          >
            <GitMerge className="mr-2 size-4" />
            Merged
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MergeStrategyItem({
  title,
  description,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      className="flex flex-col items-start gap-1 py-2.5 px-3 cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-center justify-between w-full">
        <span className="font-bold text-[13px]">{title}</span>
        {selected && <Check className="size-3.5 text-blue-500" />}
      </div>
      <p className="text-[11px] text-muted-foreground leading-normal">
        {description}
      </p>
    </DropdownMenuItem>
  );
}
