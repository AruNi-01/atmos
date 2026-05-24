'use client';

import type { DiffIndicators } from '@pierre/diffs';
import {
  IconCodeStyleBars,
  IconCollapsedRow,
  IconDiffSplit,
  IconDiffUnified,
  IconExpandAll,
  IconEyeSlash,
  IconGearFill,
  IconSymbolDiffstat,
} from '@pierre/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from '@workspace/ui';
import { cn } from '@/shared/lib/utils';

const SETTING_ROW_CLASS =
  'flex w-full cursor-pointer items-center justify-between gap-4 px-2 py-1.5 text-sm';

export interface DiffCodeViewSettingsMenuProps {
  diffStyle: 'split' | 'unified';
  onDiffStyleChange: (style: 'split' | 'unified') => void;
  showBackgrounds: boolean;
  onShowBackgroundsChange: (value: boolean) => void;
  lineNumbers: boolean;
  onLineNumbersChange: (value: boolean) => void;
  wordWrap: boolean;
  onWordWrapChange: (value: boolean) => void;
  diffIndicators: DiffIndicators;
  onDiffIndicatorsChange: (value: DiffIndicators) => void;
  collapseMode: 'expanded' | 'collapsed';
  onToggleCollapseMode: () => void;
  className?: string;
}

export function DiffCodeViewSettingsMenu({
  diffStyle,
  onDiffStyleChange,
  showBackgrounds,
  onShowBackgroundsChange,
  lineNumbers,
  onLineNumbersChange,
  wordWrap,
  onWordWrapChange,
  diffIndicators,
  onDiffIndicatorsChange,
  collapseMode,
  onToggleCollapseMode,
  className,
}: DiffCodeViewSettingsMenuProps) {
  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)}>
      <button
        type="button"
        title={diffStyle === 'split' ? 'Switch to unified view' : 'Switch to split view'}
        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        onClick={() =>
          onDiffStyleChange(diffStyle === 'split' ? 'unified' : 'split')
        }
      >
        {diffStyle === 'split' ? (
          <IconDiffSplit className="size-3.5" />
        ) : (
          <IconDiffUnified className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        title={
          collapseMode === 'expanded' ? 'Collapse all files' : 'Expand all files'
        }
        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        onClick={onToggleCollapseMode}
      >
        {collapseMode === 'expanded' ? (
          <IconExpandAll className="size-3.5" />
        ) : (
          <IconCollapsedRow className="size-3.5" />
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="View options"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <IconGearFill className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem
            className="cursor-default p-0"
            onSelect={(e) => e.preventDefault()}
          >
            <label className={SETTING_ROW_CLASS}>
              <span className="min-w-0 flex-1">Backgrounds</span>
              <Switch
                checked={showBackgrounds}
                onCheckedChange={onShowBackgroundsChange}
              />
            </label>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-default p-0"
            onSelect={(e) => e.preventDefault()}
          >
            <label className={SETTING_ROW_CLASS}>
              <span className="min-w-0 flex-1">Line numbers</span>
              <Switch
                checked={lineNumbers}
                onCheckedChange={onLineNumbersChange}
              />
            </label>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-default p-0"
            onSelect={(e) => e.preventDefault()}
          >
            <label className={SETTING_ROW_CLASS}>
              <span className="min-w-0 flex-1">Word wrap</span>
              <Switch checked={wordWrap} onCheckedChange={onWordWrapChange} />
            </label>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="w-full px-2 focus:bg-transparent"
            onSelect={(e) => e.preventDefault()}
          >
            <div className="flex w-full items-center justify-between gap-3 py-1.5 text-sm">
              <span className="shrink-0 whitespace-nowrap">Indicator style</span>
              <ToggleGroup
                type="single"
                value={diffIndicators}
                onValueChange={(value) => {
                  if (value) onDiffIndicatorsChange(value as DiffIndicators);
                }}
                className="gap-0.5"
              >
                <ToggleGroupItem
                  value="bars"
                  className="size-7 p-0"
                  aria-label="Bar indicators"
                >
                  <IconCodeStyleBars className="size-3" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="classic"
                  className="size-7 p-0"
                  aria-label="Classic indicators"
                >
                  <IconSymbolDiffstat className="size-3" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="none"
                  className="size-7 p-0"
                  aria-label="No indicators"
                >
                  <IconEyeSlash className="size-3" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
