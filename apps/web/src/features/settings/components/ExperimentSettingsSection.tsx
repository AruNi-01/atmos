'use client';

import React from 'react';
import { Switch } from '@workspace/ui';
import { useExperimentSettings } from '@/features/settings/hooks/use-experiment-settings';

export function ExperimentSettingsSection() {
  const {
    managementTerminalsEnabled,
    managementAgentsEnabled,
    centerWikiTabEnabled,
    loadSettings,
    setManagementTerminalsEnabled,
    setManagementAgentsEnabled,
    setCenterWikiTabEnabled,
  } = useExperimentSettings();

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 border-b border-border px-6 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">Terminals (Management Center)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Monitor and manage terminal usage across your system from the Management Center.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={managementTerminalsEnabled}
              onCheckedChange={(checked) => void setManagementTerminalsEnabled(checked)}
            />
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 border-b border-border px-6 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">ACP Agents (Management Center and footer ACP Chat)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Enable ACP Chat panel for GUI-based agent conversations with quick access from Management Center and footer.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={managementAgentsEnabled}
              onCheckedChange={(checked) => void setManagementAgentsEnabled(checked)}
            />
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 px-6 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">Project Wiki (Center Tabs)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Enable Project Wiki as a center stage tab for quick access to your project documentation and knowledge base.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={centerWikiTabEnabled}
              onCheckedChange={(checked) => void setCenterWikiTabEnabled(checked)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
