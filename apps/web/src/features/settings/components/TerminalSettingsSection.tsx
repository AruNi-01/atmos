'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Switch,
} from '@workspace/ui';
import { Check, ChevronDown } from 'lucide-react';
import type { TerminalFileLinkOpenMode } from '@/features/settings/hooks/use-terminal-link-settings';
import {
  QUICK_OPEN_APP_MAP,
  QUICK_OPEN_APP_OPTIONS,
  QuickOpenAppIcon,
  type QuickOpenAppName,
} from '@/app-shell/quick-open-apps';

const TERMINAL_LINK_MODE_OPTIONS = [
  {
    value: 'atmos',
    label: 'Atmos',
    description: 'Open files in the built-in editor and reveal directories in Files.',
  },
  {
    value: 'finder',
    label: 'Finder',
    description: 'Open files and directories in Finder.',
  },
  {
    value: 'app',
    label: 'Quick Open App',
    description: 'Open terminal file links with a selected external app.',
  },
] as const;

export function TerminalSettingsSection({
  fileLinkOpenMode,
  fileLinkOpenApp,
  useLastSplitAgentOnSplit,
  lastSplitAgentId,
  setFileLinkOpenMode,
  setFileLinkOpenApp,
  setUseLastSplitAgentOnSplit,
}: {
  fileLinkOpenMode: TerminalFileLinkOpenMode;
  fileLinkOpenApp: QuickOpenAppName;
  useLastSplitAgentOnSplit: boolean;
  lastSplitAgentId: string | null;
  setFileLinkOpenMode: (mode: TerminalFileLinkOpenMode) => Promise<void> | void;
  setFileLinkOpenApp: (app: QuickOpenAppName) => Promise<void> | void;
  setUseLastSplitAgentOnSplit: (enabled: boolean) => void;
}) {
  const activeTerminalLinkMode =
    TERMINAL_LINK_MODE_OPTIONS.find((option) => option.value === fileLinkOpenMode) ??
    TERMINAL_LINK_MODE_OPTIONS[0];
  const activeQuickOpenApp = QUICK_OPEN_APP_MAP[fileLinkOpenApp];

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
        <div>
          <p className="text-base font-medium text-foreground">File link open mode</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Choose how terminal file and directory links should open when clicked.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3">
          {fileLinkOpenMode === 'app' && activeQuickOpenApp && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-w-44 justify-between">
                  <span className="flex min-w-0 items-center gap-2">
                    <QuickOpenAppIcon
                      iconName={activeQuickOpenApp.iconName}
                      themed={activeQuickOpenApp.themed}
                      className="size-4 shrink-0"
                    />
                    <span className="truncate">{activeQuickOpenApp.label}</span>
                  </span>
                  <ChevronDown className="ml-2 size-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {QUICK_OPEN_APP_OPTIONS.map((app) => (
                  <DropdownMenuItem
                    key={app.name}
                    className="cursor-pointer"
                    onClick={() => void setFileLinkOpenApp(app.name)}
                  >
                    <QuickOpenAppIcon
                      iconName={app.iconName}
                      themed={app.themed}
                      className="mr-2 size-4"
                    />
                    <span className="flex-1">{app.label}</span>
                    {fileLinkOpenApp === app.name && <Check className="size-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-w-48 justify-between">
                <span>{activeTerminalLinkMode.label}</span>
                <ChevronDown className="ml-2 size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              {TERMINAL_LINK_MODE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  className="cursor-pointer items-start"
                  onClick={() => void setFileLinkOpenMode(option.value as TerminalFileLinkOpenMode)}
                >
                  <div className="flex-1 pr-3">
                    <p className="text-sm font-medium text-foreground">{option.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                  {fileLinkOpenMode === option.value && <Check className="mt-0.5 size-4 shrink-0" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
        <div>
          <p className="text-base font-medium text-foreground">Default split agent</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            When enabled, plain split (toolbar click, ⌘D, or context menu) reuses the last agent you
            picked from a split submenu. Hover split to choose a different agent.
          </p>
          {lastSplitAgentId ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Last split agent:{' '}
              <span className="font-medium text-foreground">{lastSplitAgentId}</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-end">
          <Switch
            checked={useLastSplitAgentOnSplit}
            onCheckedChange={setUseLastSplitAgentOnSplit}
          />
        </div>
      </div>
    </div>
  );
}
