'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@workspace/ui';
import {
  MAX_CANVAS_MAX_RENDERED_TERMINALS,
  MAX_CANVAS_TERMINAL_CONTEXT_MAX_LINES,
  MIN_CANVAS_MAX_RENDERED_TERMINALS,
  MIN_CANVAS_TERMINAL_CONTEXT_MAX_LINES,
  useCanvasSettingsStore,
} from '@/features/canvas/store/canvas-settings-store';
import {
  SettingsGroup,
  SettingsGroupRow,
  SettingsSection,
} from '@/features/settings/components/settings/SettingsGroupCard';

export function CanvasSettingsSection() {
  const t = useTranslations('settings.canvasSection');
  const pageT = useTranslations('settings.modal');
  const {
    autoSaveInterval,
    maxRenderedTerminals,
    terminalContextMaxLines,
    loadSettings,
    setAutoSaveInterval,
    setMaxRenderedTerminals,
    setTerminalContextMaxLines,
  } = useCanvasSettingsStore();
  const [localInterval, setLocalInterval] = React.useState(autoSaveInterval.toString());
  const [localMaxRenderedTerminals, setLocalMaxRenderedTerminals] = React.useState(
    maxRenderedTerminals.toString(),
  );
  const [localTerminalContextMaxLines, setLocalTerminalContextMaxLines] = React.useState(
    terminalContextMaxLines.toString(),
  );

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  React.useEffect(() => {
    setLocalInterval(autoSaveInterval.toString());
  }, [autoSaveInterval]);

  React.useEffect(() => {
    setLocalMaxRenderedTerminals(maxRenderedTerminals.toString());
  }, [maxRenderedTerminals]);

  React.useEffect(() => {
    setLocalTerminalContextMaxLines(terminalContextMaxLines.toString());
  }, [terminalContextMaxLines]);

  const handleIntervalChange = async (value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) return;

    setLocalInterval(value);
    await setAutoSaveInterval(num);
  };

  const handleMaxRenderedTerminalsChange = async (value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) return;

    const clamped = Math.min(
      MAX_CANVAS_MAX_RENDERED_TERMINALS,
      Math.max(MIN_CANVAS_MAX_RENDERED_TERMINALS, num),
    );
    setLocalMaxRenderedTerminals(clamped.toString());
    await setMaxRenderedTerminals(clamped);
  };

  const handleTerminalContextMaxLinesChange = async (value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) return;

    const clamped = Math.min(
      MAX_CANVAS_TERMINAL_CONTEXT_MAX_LINES,
      Math.max(MIN_CANVAS_TERMINAL_CONTEXT_MAX_LINES, num),
    );
    setLocalTerminalContextMaxLines(clamped.toString());
    await setTerminalContextMaxLines(clamped);
  };

  return (
    <SettingsSection
      id="canvas"
      title={pageT('sections.canvas.label')}
      description={pageT('sections.canvas.description')}
    >
      <SettingsGroup>
        <SettingsGroupRow
          wide
          title={t('autoSave.title')}
          description={t('autoSave.description')}
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              max="60"
              value={localInterval}
              onChange={(event) => setLocalInterval(event.target.value)}
              onBlur={(event) => handleIntervalChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleIntervalChange(localInterval);
                }
              }}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{t('autoSave.seconds')}</span>
          </div>
        </SettingsGroupRow>
        <SettingsGroupRow
          wide
          title={t('renderedTerminals.title')}
          description={t('renderedTerminals.description')}
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={MIN_CANVAS_MAX_RENDERED_TERMINALS}
              max={MAX_CANVAS_MAX_RENDERED_TERMINALS}
              value={localMaxRenderedTerminals}
              onChange={(event) => setLocalMaxRenderedTerminals(event.target.value)}
              onBlur={(event) => void handleMaxRenderedTerminalsChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleMaxRenderedTerminalsChange(localMaxRenderedTerminals);
                }
              }}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{t('renderedTerminals.terminals')}</span>
          </div>
        </SettingsGroupRow>
        <SettingsGroupRow
          wide
          title={t('terminalContext.title')}
          description={
            <>
              {t('terminalContext.descriptionPrefix')}{' '}
              <code className="font-mono text-[11px]">extract-text</code>
              {t('terminalContext.descriptionSuffix')}
            </>
          }
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={MIN_CANVAS_TERMINAL_CONTEXT_MAX_LINES}
              max={MAX_CANVAS_TERMINAL_CONTEXT_MAX_LINES}
              value={localTerminalContextMaxLines}
              onChange={(event) => setLocalTerminalContextMaxLines(event.target.value)}
              onBlur={(event) => void handleTerminalContextMaxLinesChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleTerminalContextMaxLinesChange(localTerminalContextMaxLines);
                }
              }}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{t('terminalContext.lines')}</span>
          </div>
        </SettingsGroupRow>
      </SettingsGroup>
    </SettingsSection>
  );
}
