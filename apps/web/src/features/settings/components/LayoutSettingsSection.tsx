'use client';

import React from 'react';
import { useQueryState } from 'nuqs';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Switch,
  cn,
} from '@workspace/ui';
import { ChevronDown, Columns2, PanelBottom } from 'lucide-react';
import { useExperimentSettings } from '@/features/settings/hooks/use-experiment-settings';
import { useLayoutSettings } from '@/features/settings/hooks/use-layout-settings';
import { settingsModalParams } from '@/shared/lib/nuqs/searchParams';

export function LayoutSettingsSection() {
  const {
    projectFilesSide,
    workspaceSidebarTwoColumn,
    workspaceSidebarTwoColumnShowPinned,
    workspaceSidebarSecondColumnKanban,
    workspaceSidebarTimeTwoColumn,
    workspaceSidebarStatusTwoColumn,
    showWsConnection,
    showUsageCarousel,
    showAgentStatus,
    loadSettings,
    setProjectFilesSide,
    setWorkspaceSidebarTwoColumn,
    setWorkspaceSidebarTwoColumnShowPinned,
    setWorkspaceSidebarSecondColumnKanban,
    setWorkspaceSidebarTimeTwoColumn,
    setWorkspaceSidebarStatusTwoColumn,
    setFooterShowWsConnection,
    setFooterShowUsageCarousel,
    setFooterShowAgentStatus,
  } = useLayoutSettings();
  const managementAgentsEnabled = useExperimentSettings((state) => state.managementAgentsEnabled);
  const loadExperimentSettings = useExperimentSettings((state) => state.loadSettings);
  const [, setActiveSettingTab] = useQueryState('activeSettingTab', settingsModalParams.activeSettingTab);
  const [workspaceSidebarLayoutExpanded, setWorkspaceSidebarLayoutExpanded] = React.useState(false);
  const [footerLayoutExpanded, setFooterLayoutExpanded] = React.useState(false);
  const isAnyTwoColumnEnabled =
    workspaceSidebarTwoColumn || workspaceSidebarTimeTwoColumn || workspaceSidebarStatusTwoColumn;
  const footerEnabledCount =
    Number(showWsConnection) + Number(showUsageCarousel) + Number(showAgentStatus);

  React.useEffect(() => {
    loadSettings();
    void loadExperimentSettings();
  }, [loadSettings, loadExperimentSettings]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
          <div>
            <p className="text-base font-medium text-foreground">Project Files show side</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Choose which sidebar displays the project file tree.
            </p>
          </div>
          <div className="flex items-center justify-end">
            <div className="inline-flex h-9 items-center rounded-lg border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setProjectFilesSide('left')}
                className={cn(
                  'h-full rounded-md px-3 text-sm font-medium transition-colors',
                  projectFilesSide === 'left'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Left Sidebar
              </button>
              <button
                type="button"
                onClick={() => setProjectFilesSide('right')}
                className={cn(
                  'h-full rounded-md px-3 text-sm font-medium transition-colors',
                  projectFilesSide === 'right'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Right Sidebar
              </button>
            </div>
          </div>
        </div>
      </div>

      <Collapsible
        open={workspaceSidebarLayoutExpanded}
        onOpenChange={setWorkspaceSidebarLayoutExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <Columns2 className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">Workspace Sidebar Two-Column Layout</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Configure the optional two-column workspace browser for Project, By Time, and By Status sidebar modes.
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
          <div className="pt-1 text-xs text-muted-foreground">
            {workspaceSidebarTwoColumn || workspaceSidebarTimeTwoColumn || workspaceSidebarStatusTwoColumn
              ? 'Enabled'
              : 'Disabled'}
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border px-4">
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">Project sidebar two-column layout</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Show projects in the first column and open each project&apos;s workspaces in a resizable second column.
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarTwoColumn(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">Show pinned workspaces in second column</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    When the Project two-column layout is on, also show the selected project&apos;s pinned workspaces at the top of the second column while keeping the global pinned section in the left column.
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarTwoColumnShowPinned}
                    disabled={!workspaceSidebarTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarTwoColumnShowPinned(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">Second column uses Kanban cards</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    When any two-column sidebar layout is enabled, render second-column workspaces with the same card style and Properties visibility as the Kanban view.
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarSecondColumnKanban}
                    disabled={!isAnyTwoColumnEnabled}
                    onCheckedChange={(checked) => void setWorkspaceSidebarSecondColumnKanban(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">By Time group uses second column</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    In the sidebar&apos;s By Time mode, clicking a group opens its workspaces in a second resizable column instead of expanding inline.
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarTimeTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarTimeTwoColumn(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="px-2 py-4">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">By Status group uses second column</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    In the sidebar&apos;s By Status mode, clicking a group opens its workspaces in a second resizable column instead of expanding inline.
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarStatusTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarStatusTwoColumn(!!checked)}
                  />
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={footerLayoutExpanded}
        onOpenChange={setFooterLayoutExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <PanelBottom className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">Footer layout</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Choose which status strips appear in the app footer. When every item below is off and ACP Chat is disabled in Experiments, the footer is hidden.
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
          <div className="pt-1 text-xs text-muted-foreground">
            {footerEnabledCount > 0 ? `${footerEnabledCount} enabled` : 'Hidden'}
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border px-4">
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
                <div>
                  <p className="text-sm font-medium text-foreground">WebSocket connection status</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Show live connection state and active WebSocket clients in the footer.
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={showWsConnection}
                    onCheckedChange={(checked) => void setFooterShowWsConnection(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
                <div>
                  <p className="text-sm font-medium text-foreground">AI Quota Usage carousel</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Rotate enabled AI usage summaries in the footer. Provider picks and the master switch in AI Usage also apply here.
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={showUsageCarousel}
                    onCheckedChange={(checked) => void setFooterShowUsageCarousel(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
                <div>
                  <p className="text-sm font-medium text-foreground">Agent Status Panel</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Show running agent sessions in the footer. Install hooks for each agent in{' '}
                    <button
                      type="button"
                      className="text-foreground underline underline-offset-2 hover:text-foreground/80"
                      onClick={() => void setActiveSettingTab('code-agent')}
                    >
                      Code Agent
                    </button>{' '}
                    so Atmos can receive their state.
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={showAgentStatus}
                    onCheckedChange={(checked) => void setFooterShowAgentStatus(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="px-2 py-4">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-sm font-medium text-foreground">ACP Agent Chat entry</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Opens the floating ACP chat panel from the footer when enabled. Turn it on or off in Experiments — not controlled here.
                  </p>
                </div>
                <div className="flex flex-col items-end justify-center gap-2 text-right">
                  <span className="text-xs text-muted-foreground">
                    {managementAgentsEnabled ? 'Enabled in Experiments' : 'Disabled in Experiments'}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => void setActiveSettingTab('experiments')}
                  >
                    Open Experiments
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
