'use client';

import React from 'react';
import type { DiffIndicators } from '@pierre/diffs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from '@workspace/ui';
import {
  ChevronDown,
  Code2,
  GitCompareArrows,
  Rows3,
  SquareSplitHorizontal,
} from 'lucide-react';
import {
  IconCodeStyleBars,
  IconEyeSlash,
  IconSymbolDiffstat,
} from '@pierre/icons';
import { useEditorSettings } from '@/features/settings/hooks/use-editor-settings';
import { useDiffSettings, type DiffSettingsStyle } from '@/features/settings/hooks/use-diff-settings';

function SettingRow({
  title,
  description,
  children,
  wide = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="border-b border-border px-2 py-4 last:border-b-0">
      <div
        className={cn(
          'grid gap-8',
          wide
            ? 'grid-cols-[minmax(0,1fr)_320px]'
            : 'grid-cols-[minmax(0,1fr)_100px]',
        )}
      >
        <div>
          <p className="text-base font-medium text-foreground">{title}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex items-center justify-end">{children}</div>
      </div>
    </div>
  );
}

function SettingsGroup({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="overflow-hidden rounded-2xl border border-border"
    >
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 size-5 shrink-0">
              <Icon className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">{title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="border-t border-border px-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DiffStyleControl({
  value,
  onChange,
}: {
  value: DiffSettingsStyle;
  onChange: (value: DiffSettingsStyle) => void;
}) {
  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-border bg-background p-0.5">
      <button
        type="button"
        onClick={() => onChange('split')}
        className={cn(
          'flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
          value === 'split'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <SquareSplitHorizontal className="size-4" />
        Side by side
      </button>
      <button
        type="button"
        onClick={() => onChange('unified')}
        className={cn(
          'flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
          value === 'unified'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Rows3 className="size-4" />
        Unified
      </button>
    </div>
  );
}

function IndicatorStyleControl({
  value,
  onChange,
}: {
  value: DiffIndicators;
  onChange: (value: DiffIndicators) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as DiffIndicators);
      }}
      className="gap-1"
    >
      <ToggleGroupItem value="bars" className="size-9 p-0" aria-label="Bar indicators">
        <IconCodeStyleBars className="size-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="classic" className="size-9 p-0" aria-label="Classic indicators">
        <IconSymbolDiffstat className="size-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="none" className="size-9 p-0" aria-label="No indicators">
        <IconEyeSlash className="size-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function EditorSettingsSection() {
  const {
    autoSave,
    lineWrap,
    bracketMatching,
    minimap,
    breadcrumbs,
    lineHighlight,
    gitIntegration,
    loadSettings,
    setAutoSave,
    setLineWrap,
    setBracketMatching,
    setMinimap,
    setBreadcrumbs,
    setLineHighlight,
    setGitIntegration,
  } = useEditorSettings();
  const {
    diffStyle,
    showBackgrounds,
    lineNumbers,
    wordWrap,
    diffIndicators,
    loadSettings: loadDiffSettings,
    setDiffStyle,
    setShowBackgrounds,
    setLineNumbers,
    setWordWrap,
    setDiffIndicators,
  } = useDiffSettings();
  const [codeEditorExpanded, setCodeEditorExpanded] = React.useState(true);
  const [diffExpanded, setDiffExpanded] = React.useState(true);

  React.useEffect(() => {
    void loadSettings();
    void loadDiffSettings();
  }, [loadSettings, loadDiffSettings]);

  return (
    <div className="space-y-4">
      <SettingsGroup
        open={codeEditorExpanded}
        onOpenChange={setCodeEditorExpanded}
        icon={Code2}
        title="Code Editor"
        description="Configure typing, navigation, and inline source-code affordances."
      >
        <SettingRow
          title="Auto Save"
          description="Automatically saves the current file after 2 seconds of no typing."
        >
          <Switch checked={autoSave} onCheckedChange={(checked) => void setAutoSave(!!checked)} />
        </SettingRow>
        <SettingRow
          title="Line Wrap"
          description="Wrap long lines inside the editor instead of scrolling horizontally."
        >
          <Switch checked={lineWrap} onCheckedChange={(checked) => void setLineWrap(!!checked)} />
        </SettingRow>
        <SettingRow
          title="Bracket Matching"
          description="Highlight matching brackets and show bracket pairs."
        >
          <Switch
            checked={bracketMatching}
            onCheckedChange={(checked) => void setBracketMatching(!!checked)}
          />
        </SettingRow>
        <SettingRow title="Minimap" description="Show a minimap on the right side for quick navigation.">
          <Switch checked={minimap} onCheckedChange={(checked) => void setMinimap(!!checked)} />
        </SettingRow>
        <SettingRow title="Breadcrumbs" description="Show breadcrumb navigation at the top of the editor.">
          <Switch checked={breadcrumbs} onCheckedChange={(checked) => void setBreadcrumbs(!!checked)} />
        </SettingRow>
        <SettingRow
          title="Line Highlight"
          description="Highlight the current line and matching selections."
        >
          <Switch
            checked={lineHighlight}
            onCheckedChange={(checked) => void setLineHighlight(!!checked)}
          />
        </SettingRow>
        <SettingRow title="Git Integration" description="Show git changes and diff information in the editor.">
          <Switch
            checked={gitIntegration}
            onCheckedChange={(checked) => void setGitIntegration(!!checked)}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        open={diffExpanded}
        onOpenChange={setDiffExpanded}
        icon={GitCompareArrows}
        title="Diff"
        description="Configure the default diff layout and toolbar view options."
      >
        <SettingRow
          title="Layout"
          description="Choose the default layout used by center review diffs and pull request diffs."
          wide
        >
          <DiffStyleControl value={diffStyle} onChange={(value) => void setDiffStyle(value)} />
        </SettingRow>
        <SettingRow title="Backgrounds" description="Tint added and removed lines with diff backgrounds.">
          <Switch
            checked={showBackgrounds}
            onCheckedChange={(checked) => void setShowBackgrounds(!!checked)}
          />
        </SettingRow>
        <SettingRow title="Line Numbers" description="Show source line numbers in diff panes.">
          <Switch
            checked={lineNumbers}
            onCheckedChange={(checked) => void setLineNumbers(!!checked)}
          />
        </SettingRow>
        <SettingRow title="Word Wrap" description="Wrap long diff lines instead of scrolling horizontally.">
          <Switch checked={wordWrap} onCheckedChange={(checked) => void setWordWrap(!!checked)} />
        </SettingRow>
        <SettingRow title="Indicator Style" description="Choose how changed lines are marked in the gutter." wide>
          <IndicatorStyleControl
            value={diffIndicators}
            onChange={(value) => void setDiffIndicators(value)}
          />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
