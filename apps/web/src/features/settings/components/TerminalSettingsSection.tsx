'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Switch,
} from '@workspace/ui';
import { Check, ChevronDown } from 'lucide-react';
import type { TerminalFileLinkOpenMode } from '@/features/settings/store/terminal-link-settings-store';
import {
  MAX_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES,
  MIN_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES,
  TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_STEP_BYTES,
  normalizeTerminalSideContextPromptBudgetBytes,
} from '@/features/settings/store/terminal-side-chat-settings-store';
import {
  QUICK_OPEN_APP_MAP,
  QUICK_OPEN_APP_OPTIONS,
  QuickOpenAppIcon,
  type QuickOpenAppName,
} from '@/app-shell/quick-open-apps';

export function TerminalSettingsSection({
  fileLinkOpenMode,
  fileLinkOpenApp,
  useLastSplitAgentOnSplit,
  lastSplitAgentId,
  sideContextPromptBudgetBytes,
  setFileLinkOpenMode,
  setFileLinkOpenApp,
  setUseLastSplitAgentOnSplit,
  setSideContextPromptBudgetBytes,
  terminalCacheMaxSize,
  terminalCacheMaxPanels,
  setTerminalCacheMaxSize,
  setTerminalCacheMaxPanels,
}: {
  fileLinkOpenMode: TerminalFileLinkOpenMode;
  fileLinkOpenApp: QuickOpenAppName;
  useLastSplitAgentOnSplit: boolean;
  lastSplitAgentId: string | null;
  sideContextPromptBudgetBytes: number;
  setFileLinkOpenMode: (mode: TerminalFileLinkOpenMode) => Promise<void> | void;
  setFileLinkOpenApp: (app: QuickOpenAppName) => Promise<void> | void;
  setUseLastSplitAgentOnSplit: (enabled: boolean) => void;
  setSideContextPromptBudgetBytes: (bytes: number) => Promise<void> | void;
  terminalCacheMaxSize: number;
  terminalCacheMaxPanels: number;
  setTerminalCacheMaxSize: (size: number) => Promise<void> | void;
  setTerminalCacheMaxPanels: (panels: number) => Promise<void> | void;
}) {
  const t = useTranslations('settings.terminalSection');
  const locale = useLocale();
  const [localTerminalCacheMaxSize, setLocalTerminalCacheMaxSize] = React.useState(terminalCacheMaxSize.toString());
  const [localTerminalCacheMaxPanels, setLocalTerminalCacheMaxPanels] = React.useState(terminalCacheMaxPanels.toString());
  const [localSideContextBudget, setLocalSideContextBudget] = React.useState(
    sideContextPromptBudgetBytes.toString(),
  );
  const terminalLinkModeOptions = [
    {
      value: 'atmos',
      label: t('linkModes.atmos.label'),
      description: t('linkModes.atmos.description'),
    },
    {
      value: 'finder',
      label: t('linkModes.finder.label'),
      description: t('linkModes.finder.description'),
    },
    {
      value: 'app',
      label: t('linkModes.app.label'),
      description: t('linkModes.app.description'),
    },
  ] as const;
  const activeTerminalLinkMode =
    terminalLinkModeOptions.find((option) => option.value === fileLinkOpenMode) ??
    terminalLinkModeOptions[0];
  const activeQuickOpenApp = QUICK_OPEN_APP_MAP[fileLinkOpenApp];
  const formattedMinSideContextBudget =
    MIN_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES.toLocaleString(locale);
  const formattedMaxSideContextBudget =
    MAX_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES.toLocaleString(locale);

  React.useEffect(() => {
    setLocalSideContextBudget(sideContextPromptBudgetBytes.toString());
  }, [sideContextPromptBudgetBytes]);

  React.useEffect(() => {
    setLocalTerminalCacheMaxSize(terminalCacheMaxSize.toString());
  }, [terminalCacheMaxSize]);

  React.useEffect(() => {
    setLocalTerminalCacheMaxPanels(terminalCacheMaxPanels.toString());
  }, [terminalCacheMaxPanels]);

  const handleTerminalCacheMaxSizeCommit = async (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      setLocalTerminalCacheMaxSize(terminalCacheMaxSize.toString());
      return;
    }
    const normalized = Math.min(50, Math.max(1, parsed));
    setLocalTerminalCacheMaxSize(normalized.toString());
    await setTerminalCacheMaxSize(normalized);
  };

  const handleTerminalCacheMaxPanelsCommit = async (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      setLocalTerminalCacheMaxPanels(terminalCacheMaxPanels.toString());
      return;
    }
    const normalized = Math.min(100, Math.max(1, parsed));
    setLocalTerminalCacheMaxPanels(normalized.toString());
    await setTerminalCacheMaxPanels(normalized);
  };

  const handleSideContextBudgetCommit = async (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      setLocalSideContextBudget(sideContextPromptBudgetBytes.toString());
      return;
    }

    const normalized = normalizeTerminalSideContextPromptBudgetBytes(parsed);
    setLocalSideContextBudget(normalized.toString());
    await setSideContextPromptBudgetBytes(normalized);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
        <div>
          <p className="text-base font-medium text-foreground">{t('fileLinkOpenMode.title')}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('fileLinkOpenMode.description')}
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
              {terminalLinkModeOptions.map((option) => (
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
          <p className="text-base font-medium text-foreground">{t('defaultSplitAgent.title')}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('defaultSplitAgent.description')}
          </p>
          {lastSplitAgentId ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('defaultSplitAgent.lastAgent')}{' '}
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
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-t border-border px-6 py-5">
        <div>
          <p className="text-base font-medium text-foreground">{t('sideContextBudget.title')}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('sideContextBudget.description', {
              min: formattedMinSideContextBudget,
              max: formattedMaxSideContextBudget,
            })}
          </p>
        </div>
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={MIN_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES}
              max={MAX_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES}
              step={TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_STEP_BYTES}
              value={localSideContextBudget}
              onChange={(event) => setLocalSideContextBudget(event.target.value)}
              onBlur={(event) => void handleSideContextBudgetCommit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleSideContextBudgetCommit(localSideContextBudget);
                }
              }}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">{t('sideContextBudget.bytes')}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-t border-border px-6 py-5">
        <div>
          <p className="text-base font-medium text-foreground">{t('cacheWorkspaces.title')}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('cacheWorkspaces.description')}
          </p>
        </div>
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={50}
              step={1}
              value={localTerminalCacheMaxSize}
              onChange={(event) => setLocalTerminalCacheMaxSize(event.target.value)}
              onBlur={(event) => void handleTerminalCacheMaxSizeCommit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleTerminalCacheMaxSizeCommit(localTerminalCacheMaxSize);
                }
              }}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{t('cacheWorkspaces.contexts')}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-t border-border px-6 py-5">
        <div>
          <p className="text-base font-medium text-foreground">{t('cachePanels.title')}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('cachePanels.description')}
          </p>
        </div>
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={100}
              step={1}
              value={localTerminalCacheMaxPanels}
              onChange={(event) => setLocalTerminalCacheMaxPanels(event.target.value)}
              onBlur={(event) => void handleTerminalCacheMaxPanelsCommit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleTerminalCacheMaxPanelsCommit(localTerminalCacheMaxPanels);
                }
              }}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{t('cachePanels.panels')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
