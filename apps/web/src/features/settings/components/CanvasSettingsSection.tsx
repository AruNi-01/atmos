'use client';

import React from 'react';
import { Input } from '@workspace/ui';
import {
  MAX_CANVAS_MAX_RENDERED_TERMINALS,
  MAX_CANVAS_TERMINAL_CONTEXT_MAX_LINES,
  MIN_CANVAS_MAX_RENDERED_TERMINALS,
  MIN_CANVAS_TERMINAL_CONTEXT_MAX_LINES,
  useCanvasSettings,
} from '@/features/canvas/hooks/use-canvas-settings';

export function CanvasSettingsSection() {
  const {
    autoSaveInterval,
    maxRenderedTerminals,
    terminalContextMaxLines,
    loadSettings,
    setAutoSaveInterval,
    setMaxRenderedTerminals,
    setTerminalContextMaxLines,
  } = useCanvasSettings();
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
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
          <div>
            <p className="text-base font-medium text-foreground">Auto-save Interval</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              How often the canvas automatically saves your work (in seconds).
            </p>
          </div>
          <div className="flex items-center justify-end">
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
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
          <div>
            <p className="text-base font-medium text-foreground">
              Max rendered terminals per canvas page
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Keep up to this many canvas terminals live at once. When the limit is exceeded, the
              oldest attached live terminal stops rendering until it is activated again.
            </p>
          </div>
          <div className="flex items-center justify-end">
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
              <span className="text-sm text-muted-foreground">terminals</span>
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
          <div>
            <p className="text-base font-medium text-foreground">Terminal context lines</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              When copying a canvas terminal or running <code className="text-xs">extract-text</code>,
              capture up to this many lines from the tmux pane (or live xterm buffer when active).
            </p>
          </div>
          <div className="flex items-center justify-end">
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
              <span className="text-sm text-muted-foreground">lines</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
