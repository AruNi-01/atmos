'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { DiffIndicators } from '@pierre/diffs';
import {
  Switch,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from '@workspace/ui';
import {
  Rows3,
  SquareSplitHorizontal,
} from 'lucide-react';
import {
  IconCodeStyleBars,
  IconEyeSlash,
  IconSymbolDiffstat,
} from '@pierre/icons';
import { useEditorSettingsStore } from '@/features/settings/store/editor-settings-store';
import { useDiffSettingsStore, type DiffSettingsStyle } from '@/features/settings/store/diff-settings-store';
import {
  SettingsGroupCard,
  SettingsGroupRow,
  SettingsPageStack,
} from '@/features/settings/components/settings/SettingsGroupCard';

function DiffStyleControl({
  value,
  onChange,
}: {
  value: DiffSettingsStyle;
  onChange: (value: DiffSettingsStyle) => void;
}) {
  const t = useTranslations('settings.editorSection');

  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-border bg-background p-0.5">
      <button
        type="button"
        onClick={() => onChange('split')}
        className={cn(
          'flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium',
          value === 'split'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <SquareSplitHorizontal className="size-4" />
        {t('controls.diffStyle.split')}
      </button>
      <button
        type="button"
        onClick={() => onChange('unified')}
        className={cn(
          'flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium',
          value === 'unified'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Rows3 className="size-4" />
        {t('controls.diffStyle.unified')}
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
  const t = useTranslations('settings.editorSection');

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as DiffIndicators);
      }}
      className="gap-1"
    >
      <ToggleGroupItem
        value="bars"
        className="size-9 p-0"
        aria-label={t('controls.diffIndicators.barsAria')}
      >
        <IconCodeStyleBars className="size-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="classic"
        className="size-9 p-0"
        aria-label={t('controls.diffIndicators.classicAria')}
      >
        <IconSymbolDiffstat className="size-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="none"
        className="size-9 p-0"
        aria-label={t('controls.diffIndicators.noneAria')}
      >
        <IconEyeSlash className="size-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function EditorSettingsSection() {
  const t = useTranslations('settings.editorSection');
  const {
    autoSave,
    lineWrap,
    bracketMatching,
    minimap,
    lineHighlight,
    gitIntegration,
    mdToggleDefaultOpen,
    loadSettings,
    setAutoSave,
    setLineWrap,
    setBracketMatching,
    setMinimap,
    setLineHighlight,
    setGitIntegration,
    setMdToggleDefaultOpen,
  } = useEditorSettingsStore();
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
  } = useDiffSettingsStore();
  const [codeEditorExpanded, setCodeEditorExpanded] = React.useState(true);
  const [diffExpanded, setDiffExpanded] = React.useState(true);

  React.useEffect(() => {
    void loadSettings();
    void loadDiffSettings();
  }, [loadSettings, loadDiffSettings]);

  return (
    <SettingsPageStack>
      <SettingsGroupCard
        open={codeEditorExpanded}
        onOpenChange={setCodeEditorExpanded}
        title={t('groups.codeEditor.title')}
        description={t('groups.codeEditor.description')}
      >
        <SettingsGroupRow
          title={t('rows.autoSave.title')}
          description={t('rows.autoSave.description')}
        >
          <Switch checked={autoSave} onCheckedChange={(checked) => void setAutoSave(!!checked)} />
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t('rows.lineWrap.title')}
          description={t('rows.lineWrap.description')}
        >
          <Switch checked={lineWrap} onCheckedChange={(checked) => void setLineWrap(!!checked)} />
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t('rows.bracketMatching.title')}
          description={t('rows.bracketMatching.description')}
        >
          <Switch
            checked={bracketMatching}
            onCheckedChange={(checked) => void setBracketMatching(!!checked)}
          />
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t('rows.minimap.title')}
          description={t('rows.minimap.description')}
        >
          <Switch checked={minimap} onCheckedChange={(checked) => void setMinimap(!!checked)} />
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t('rows.lineHighlight.title')}
          description={t('rows.lineHighlight.description')}
        >
          <Switch
            checked={lineHighlight}
            onCheckedChange={(checked) => void setLineHighlight(!!checked)}
          />
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t('rows.gitIntegration.title')}
          description={t('rows.gitIntegration.description')}
        >
          <Switch
            checked={gitIntegration}
            onCheckedChange={(checked) => void setGitIntegration(!!checked)}
          />
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t('rows.expandToggles.title')}
          description={t('rows.expandToggles.description')}
        >
          <Switch
            checked={mdToggleDefaultOpen}
            onCheckedChange={(checked) => void setMdToggleDefaultOpen(!!checked)}
          />
        </SettingsGroupRow>
      </SettingsGroupCard>

      <SettingsGroupCard
        open={diffExpanded}
        onOpenChange={setDiffExpanded}
        title={t('groups.diff.title')}
        description={t('groups.diff.description')}
      >
        <SettingsGroupRow
          title={t('rows.layout.title')}
          description={t('rows.layout.description')}
          wide
        >
          <DiffStyleControl value={diffStyle} onChange={(value) => void setDiffStyle(value)} />
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t('rows.backgrounds.title')}
          description={t('rows.backgrounds.description')}
        >
          <Switch
            checked={showBackgrounds}
            onCheckedChange={(checked) => void setShowBackgrounds(!!checked)}
          />
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t('rows.lineNumbers.title')}
          description={t('rows.lineNumbers.description')}
        >
          <Switch
            checked={lineNumbers}
            onCheckedChange={(checked) => void setLineNumbers(!!checked)}
          />
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t('rows.wordWrap.title')}
          description={t('rows.wordWrap.description')}
        >
          <Switch checked={wordWrap} onCheckedChange={(checked) => void setWordWrap(!!checked)} />
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t('rows.indicatorStyle.title')}
          description={t('rows.indicatorStyle.description')}
          wide
        >
          <IndicatorStyleControl
            value={diffIndicators}
            onChange={(value) => void setDiffIndicators(value)}
          />
        </SettingsGroupRow>
      </SettingsGroupCard>
    </SettingsPageStack>
  );
}
