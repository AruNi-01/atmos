'use client';

import React from 'react';
import { Switch } from '@workspace/ui';
import { useEditorSettings } from '@/hooks/use-editor-settings';

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

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 border-b border-border px-6 py-5">
          <div>
            <p className="text-sm font-medium text-foreground">Auto Save</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Automatically saves the current file after 2 seconds of no typing.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={autoSave}
              onCheckedChange={(checked) => void setAutoSave(!!checked)}
            />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 border-b border-border px-6 py-5">
          <div>
            <p className="text-sm font-medium text-foreground">Line Wrap</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Wrap long lines inside the editor instead of scrolling horizontally.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={lineWrap}
              onCheckedChange={(checked) => void setLineWrap(!!checked)}
            />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 border-b border-border px-6 py-5">
          <div>
            <p className="text-sm font-medium text-foreground">Bracket Matching</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Highlight matching brackets and show bracket pairs.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={bracketMatching}
              onCheckedChange={(checked) => void setBracketMatching(!!checked)}
            />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 border-b border-border px-6 py-5">
          <div>
            <p className="text-sm font-medium text-foreground">Minimap</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Show a minimap on the right side for quick navigation.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={minimap}
              onCheckedChange={(checked) => void setMinimap(!!checked)}
            />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 border-b border-border px-6 py-5">
          <div>
            <p className="text-sm font-medium text-foreground">Breadcrumbs</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Show breadcrumb navigation at the top of the editor.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={breadcrumbs}
              onCheckedChange={(checked) => void setBreadcrumbs(!!checked)}
            />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 border-b border-border px-6 py-5">
          <div>
            <p className="text-sm font-medium text-foreground">Line Highlight</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Highlight the current line and matching selections.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={lineHighlight}
              onCheckedChange={(checked) => void setLineHighlight(!!checked)}
            />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 px-6 py-5">
          <div>
            <p className="text-sm font-medium text-foreground">Git Integration</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Show git changes and diff information in the editor.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={gitIntegration}
              onCheckedChange={(checked) => void setGitIntegration(!!checked)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
