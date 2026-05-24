import {
  IconCollapsedRow,
  IconDiffSplit,
  IconDiffUnified,
  IconExpandAll,
  IconGearFill,
} from '@pierre/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/ui';
import { cn } from '@/shared/lib/utils';

const SETTING_ROW_CLASS =
  'flex w-full cursor-pointer items-center justify-between gap-4 px-2 py-1.5 text-sm';

type DiffStyle = 'split' | 'unified';

interface DiffViewerHeaderProps {
  canEditReview: boolean;
  diffCompareRef: string | null;
  diffStats: { additions: number; deletions: number } | null;
  diffStyle: DiffStyle;
  disableBackground: boolean;
  fileCollapsed: boolean;
  filePath: string;
  hasReviewSession: boolean;
  isReviewDiff: boolean;
  isReviewed: boolean | null;
  onToggleReviewed: (reviewed: boolean) => void;
  setDiffStyle: (style: DiffStyle) => void;
  setDisableBackground: (disabled: boolean) => void;
  setFileCollapsed: (collapsed: boolean) => void;
  setTipPaused: (paused: boolean) => void;
  setWordWrap: (wordWrap: boolean) => void;
  showTip: boolean;
  snapshotGuidFromPath: string | null;
  wordWrap: boolean;
}

export function DiffViewerHeader({
  canEditReview,
  diffCompareRef,
  diffStats,
  diffStyle,
  disableBackground,
  fileCollapsed,
  filePath,
  hasReviewSession,
  isReviewDiff,
  isReviewed,
  onToggleReviewed,
  setDiffStyle,
  setDisableBackground,
  setFileCollapsed,
  setTipPaused,
  setWordWrap,
  showTip,
  snapshotGuidFromPath,
  wordWrap,
}: DiffViewerHeaderProps) {
  return (
    <div className="h-10 flex items-center justify-between px-4 border-b border-sidebar-border bg-muted/30 shrink-0">
      <div
        className="relative h-5 flex-1 min-w-0 overflow-hidden pr-3"
        onMouseEnter={() => setTipPaused(true)}
        onMouseLeave={() => setTipPaused(false)}
      >
        <div
          className="absolute inset-x-0 h-full flex items-center gap-3 transition-all duration-500 ease-in-out"
          style={{
            transform: !isReviewDiff && showTip ? 'translateY(-100%)' : 'translateY(0)',
            opacity: !isReviewDiff && showTip ? 0 : 1,
          }}
        >
          <span className="text-sm font-medium text-foreground truncate">{filePath}</span>
          {diffCompareRef && <span className="text-xs text-muted-foreground shrink-0">vs {diffCompareRef}</span>}
          {diffStats && (diffStats.additions > 0 || diffStats.deletions > 0) && (
            <span className="text-xs font-mono shrink-0">
              {diffStats.additions > 0 && <span className="text-green-500">+{diffStats.additions}</span>}
              {diffStats.additions > 0 && diffStats.deletions > 0 && <span className="text-muted-foreground mx-1">/</span>}
              {diffStats.deletions > 0 && <span className="text-red-500">-{diffStats.deletions}</span>}
            </span>
          )}
          {snapshotGuidFromPath && hasReviewSession && !canEditReview ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 shrink-0">
                  Snapshot View
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                The snapshot view only displays the file content in the current review version and can only be read.
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {!isReviewDiff && (
          <div
            className="absolute inset-x-0 h-full flex items-center transition-all duration-500 ease-in-out"
            style={{ transform: showTip ? 'translateY(0)' : 'translateY(100%)', opacity: showTip ? 1 : 0 }}
          >
            <span className="text-xs text-muted-foreground truncate">
              Tips: Select line numbers to annotate changes and quickly send to AI Agent (⇧ Shift for multi-select)
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {isReviewed !== null ? (
          <button
            type="button"
            onClick={() => onToggleReviewed(!isReviewed)}
            disabled={!canEditReview}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0',
              isReviewed
                ? 'border-blue-500/50 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25'
                : 'border-border bg-background/80 text-foreground hover:bg-muted/50',
            )}
          >
            {isReviewed ? (
              <span className="flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-blue-500">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8L6.5 11.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : (
              <span className="flex items-center justify-center w-3.5 h-3.5 rounded-sm border border-muted-foreground/40" />
            )}
            <span>Reviewed</span>
          </button>
        ) : null}
        <button
          type="button"
          title={diffStyle === 'split' ? 'Switch to unified view' : 'Switch to split view'}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          onClick={() => setDiffStyle(diffStyle === 'split' ? 'unified' : 'split')}
        >
          {diffStyle === 'split' ? (
            <IconDiffSplit className="size-3.5" />
          ) : (
            <IconDiffUnified className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          title={fileCollapsed ? 'Expand file' : 'Collapse file'}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          onClick={() => setFileCollapsed(!fileCollapsed)}
        >
          {fileCollapsed ? (
            <IconCollapsedRow className="size-3.5" />
          ) : (
            <IconExpandAll className="size-3.5" />
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              title="View options"
            >
              <IconGearFill className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              className="cursor-default p-0"
              onSelect={(e) => e.preventDefault()}
            >
              <label className={SETTING_ROW_CLASS}>
                <span className="min-w-0 flex-1">Backgrounds</span>
                <Switch
                  checked={!disableBackground}
                  onCheckedChange={(checked) => setDisableBackground(!checked)}
                />
              </label>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-default p-0"
              onSelect={(e) => e.preventDefault()}
            >
              <label className={SETTING_ROW_CLASS}>
                <span className="min-w-0 flex-1">Word wrap</span>
                <Switch checked={wordWrap} onCheckedChange={setWordWrap} />
              </label>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
